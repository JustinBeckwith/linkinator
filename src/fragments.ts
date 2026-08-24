import { Readable } from 'node:stream';
import { extractFragmentIds, isSoftNotFound } from './links.js';
import type { InternalCheckOptions } from './options.js';
import {
	type HttpResponse,
	isHtml,
	makeRequest,
	type RequestResponse,
} from './request.js';
import { bufferStream, drainStream, toNodeReadable } from './stream-utils.js';

export type FragmentValidationResult = {
	fragment: string;
	isValid: boolean;
};

/**
 * Validates fragment identifiers against the ids a page offers. Takes the ids
 * rather than the HTML so a page can be parsed once and still answer fragments
 * that are discovered later in the crawl.
 * @param validFragments Fragment identifiers the page actually offers
 * @param fragmentsToValidate Fragment identifiers to validate
 * @returns One validation result per requested fragment
 */
export function validateFragmentsAgainstIds(
	validFragments: Set<string>,
	fragmentsToValidate: Iterable<string>,
): FragmentValidationResult[] {
	const results: FragmentValidationResult[] = [];
	for (const fragment of fragmentsToValidate) {
		results.push({
			fragment,
			// `top` addresses the start of any document rather than an element, so
			// no page has to offer an id for it. HTML matches the name ASCII
			// case-insensitively, which leaves forms like `töp` ordinary ids.
			isValid: /^[tT][oO][pP]$/.test(fragment) || validFragments.has(fragment),
		});
	}

	return results;
}

/** A fragment link that turned out to point at nothing. */
export type BrokenFragment = {
	/** The target page, without the fragment. */
	url: string;
	/** The fragment identifier, without the leading `#`. */
	fragment: string;
	/** The page that contains the link, which is what has to be fixed. */
	parent: string;
	/** Status of the target page, for reporting. */
	status: number;
};

/**
 * A fragment link whose target could not be read, so nobody knows whether it
 * points at anything. Reported rather than dropped, because a dropped fragment
 * is indistinguishable from a valid one in the result.
 */
export type UnverifiedFragment = {
	/** The target page, without the fragment. */
	url: string;
	/** The fragment identifier, without the leading `#`. */
	fragment: string;
	/** The page that contains the link. */
	parent: string;
	/** Status the target answered with during the crawl. */
	status: number;
	/** Why the target could not be read, phrased for the report. */
	reason: string;
	/** What stopped it, for the failure details. */
	cause?: Error | HttpResponse;
};

/**
 * What the crawl would make of a response, expressed as what it means for
 * fragment checking rather than in the crawl's own vocabulary.
 */
export type TargetVerdict =
	/** The crawl counts this page as reachable, so its body can be parsed. */
	| 'usable'
	/** The crawl passes over pages like this, so nothing is reported. */
	| 'ignore'
	/** The crawl calls this a failure, so its fragments stay unverified. */
	| 'failed';

/** The part of the crawl's queue the deferred pass needs. */
export type FragmentQueue = {
	add(task: () => Promise<void>): void;
	onIdle(): Promise<void>;
};

export type FragmentCheckerOptions = {
	checkOptions: InternalCheckOptions;
	/**
	 * How the crawl grades a response. Grading is delegated rather than reduced
	 * to a 2xx test here, so a page the crawl accepts through `statusCodes`
	 * answers its fragments no matter which crawl order discovered them.
	 */
	classify: (
		url: string,
		status: number,
		response: HttpResponse,
	) => TargetVerdict;
	/** Called for fragments excluded by the skip rules. */
	reportSkipped: (urlWithFragment: string, parent: string) => void;
	/** Called once per broken fragment and referring page. */
	reportBroken: (fragment: BrokenFragment) => void;
	/** Called once per unverifiable fragment and referring page. */
	reportUnverified: (fragment: UnverifiedFragment) => void;
};

/**
 * Tracks fragment links found during a crawl and reports the ones whose target
 * page does not offer them.
 *
 * Fragment checking cannot be done link by link. A fragment is discovered on
 * one page but can only be answered by another, and a crawler fetches each page
 * at most once, in an order nobody controls: a page may be fetched long before
 * the link to one of its fragments is seen. Validation is therefore split from
 * discovery, and the caller drives it in three steps.
 *
 * 1. **Discovery.** Call {@link record} for every fragment link found on a page.
 *    Nothing is validated yet, and the skip rules are applied here.
 * 2. **Validation.** Whenever a page's HTML has been fetched, call
 *    {@link validate} with its body. It remembers which ids the page offers and
 *    answers whatever fragments are pending for it. Call it for every page whose
 *    body is at hand, even when no fragment points at the page yet: the ids are
 *    kept, so a fragment discovered later is answered without asking for the
 *    page again. Call {@link markUnusable} for a page that is not HTML, since
 *    it cannot answer for fragments at all. {@link wants} works in the opposite
 *    direction: it reports whether a body that is not otherwise needed is worth
 *    fetching, so a HEAD request can be upgraded to a GET.
 * 3. **Deferred.** Once crawling is finished, call {@link finish}. It settles
 *    the fragments that were discovered after their target page had already
 *    been fetched. Targets whose ids are known are settled without a request; a
 *    target that was only HEAD-checked is requested once more, and a fragment
 *    whose target cannot be read is reported as unverified rather than passed.
 *    The class drives this step itself, because findings are lost silently
 *    when it does not run.
 *
 * Results leave through the `reportSkipped`, `reportBroken` and
 * `reportUnverified` callbacks rather than being returned, because they are
 * produced in all three steps. Each fragment is reported once per referring
 * page, and never twice for the same pair, so steps 2 and 3 may both look at the
 * same page.
 *
 * Keeping the ids of every page seen is what makes a second request the
 * exception rather than the rule, and it is the memory ceiling of this class:
 * one set of ids per page whose body was parsed, held until the crawl ends. That
 * is the same order as the crawler's own per-URL bookkeeping, but a page dense
 * in anchors costs more than an entry in a cache. The alternative, re-requesting
 * every late-discovered target, trades that memory for one request per target
 * plus the risk that a transient failure leaves a fragment unverified.
 *
 * One instance belongs to one crawl: it accumulates state for every page seen
 * and is not meant to be reused for a second run.
 *
 * @example
 * ```ts
 * const fragments = new FragmentChecker({
 * 	checkOptions,
 * 	classify: (url, status, response) => verdictForCrawledPage(status, response),
 * 	reportSkipped: (urlWithFragment, parent) => report(...),
 * 	reportBroken: ({ url, fragment, parent, status }) => report(...),
 * 	reportUnverified: ({ url, fragment, parent, reason }) => report(...),
 * });
 *
 * // while crawling a page
 * fragments.noteStatus(pageUrl, pageStatus);
 * for (const link of linksOnPage) {
 * 	await fragments.record({ url: link.url, fragment: link.fragment, parent: pageUrl });
 * }
 * await fragments.validate(pageUrl, pageBody, pageStatus);
 *
 * // once the crawl is done
 * await fragments.finish(queue);
 * ```
 */
export class FragmentChecker {
	/** Target URL -> fragment -> pages that link to it. */
	private readonly requested = new Map<string, Map<string, Set<string>>>();
	/** Target URL -> the ids that page offers, once its body has been parsed. */
	private readonly knownIds = new Map<string, Set<string>>();
	/**
	 * Target URL -> the status it answered with, for the pages the crawl
	 * reached. A page missing here was never reachable, is reported broken in
	 * its own right, and cannot be asked which fragments it offers.
	 */
	private readonly statuses = new Map<string, number>();
	/**
	 * Targets that cannot answer for their fragments: pages that are not HTML,
	 * and soft 404s whose ids mean nothing. Requesting them again would not
	 * help.
	 */
	private readonly unusable = new Set<string>();
	/** Serialized target, fragment and referring page triples already reported. */
	private readonly reported = new Set<string>();

	constructor(private readonly options: FragmentCheckerOptions) {}

	/**
	 * Whether this page has pending fragments that its HTML is still needed for.
	 * Lets the caller turn a HEAD request into a GET only when it pays off.
	 * @param url Page URL, without a fragment
	 */
	wants(url: string): boolean {
		return (
			this.requested.has(url) &&
			!this.knownIds.has(url) &&
			!this.unusable.has(url)
		);
	}

	/**
	 * Note that a page was reached, and with what status. Kept so the deferred
	 * pass knows which targets can still be asked about their fragments, and
	 * which status to report a breakage with, without searching the crawl's
	 * results.
	 * @param url Page URL, without a fragment
	 * @param status Status the page responded with
	 */
	noteStatus(url: string, status: number): void {
		this.statuses.set(url, status);
	}

	/**
	 * Note that a page cannot answer for its fragments, because it is not HTML.
	 * Saves asking for it again once the crawl is done.
	 * @param url Page URL, without a fragment
	 */
	markUnusable(url: string): void {
		this.unusable.add(url);
	}

	/**
	 * Remember a fragment link, or report it as skipped when it matches the skip
	 * rules. The referring page is kept so a breakage is reported against the
	 * page that has to be fixed.
	 * @param link The fragment link as found on the page
	 */
	async record(link: {
		url: string;
		fragment: string;
		urlWithFragment?: string;
		parent: string;
	}): Promise<void> {
		const urlWithFragment = link.urlWithFragment ?? link.url;
		if (await this.shouldSkip(link.fragment, urlWithFragment)) {
			this.options.reportSkipped(urlWithFragment, link.parent);
			return;
		}

		let fragments = this.requested.get(link.url);
		if (!fragments) {
			fragments = new Map();
			this.requested.set(link.url, fragments);
		}
		let parents = fragments.get(link.fragment);
		if (!parents) {
			parents = new Set();
			fragments.set(link.fragment, parents);
		}
		parents.add(link.parent);
	}

	/**
	 * Remember which ids a page offers, and answer every fragment pending for it.
	 * The ids are kept even when nothing points at the page yet, so a fragment
	 * discovered later needs no second request. Does nothing when the page looks
	 * like a soft 404, since its ids mean nothing.
	 * @param url Page URL, without a fragment
	 * @param html The page's body
	 * @param status Status the page responded with
	 */
	async validate(url: string, html: Buffer, status: number): Promise<void> {
		let ids = this.knownIds.get(url);
		if (!ids) {
			if (this.unusable.has(url)) {
				return;
			}
			if (isSoftNotFound(html)) {
				this.unusable.add(url);
				return;
			}
			ids = await extractFragmentIds(Readable.from([html]));
			this.knownIds.set(url, ids);
		}

		this.report(url, ids, status);
	}

	/**
	 * Settle the fragments left over once crawling is done, running whatever
	 * requests are still needed on the caller's queue and waiting for them.
	 * @param queue Queue to run the remaining requests on
	 */
	async finish(queue: FragmentQueue): Promise<void> {
		for (const task of this.deferredTasks()) {
			queue.add(task);
		}

		await queue.onIdle();
	}

	/**
	 * Work left over once crawling is done: the fragments whose target page was
	 * already fetched before they were discovered. Targets whose ids are known
	 * are settled without a request; the rest are fetched once more.
	 * @returns One thunk per page, to be run by the caller's queue
	 */
	private deferredTasks(): Array<() => Promise<void>> {
		const tasks: Array<() => Promise<void>> = [];
		for (const url of this.requested.keys()) {
			const status = this.statuses.get(url);
			const ids = this.knownIds.get(url);
			if (ids) {
				this.report(url, ids, status ?? 0);
				continue;
			}

			// A page that is not HTML, or is a soft 404, cannot answer for its
			// fragments, and asking again would return the same page.
			if (this.unusable.has(url)) {
				continue;
			}

			// An unreachable page is already reported broken in its own right, and
			// cannot be asked about its fragments.
			if (status === undefined) {
				continue;
			}

			tasks.push(async () => {
				await this.validateByRefetching(url, status);
			});
		}

		return tasks;
	}

	/**
	 * Request a page again to learn which fragments it offers. Response bodies
	 * are single-use streams and are deliberately not cached, so this is the only
	 * way to answer fragments pointing at a page that was never parsed, which in
	 * practice means a target that only ever got a HEAD request.
	 */
	private async validateByRefetching(
		url: string,
		status: number,
	): Promise<void> {
		let response: RequestResponse | undefined;
		try {
			response = await makeRequest('GET', url, {
				headers: this.options.checkOptions.headers,
				timeout: this.options.checkOptions.timeout,
				redirect: 'follow',
				allowInsecureCerts: this.options.checkOptions.allowInsecureCerts,
			});
		} catch (error) {
			this.reportUnverifiable(
				url,
				status,
				'the target page could not be requested again',
				error as Error,
			);
			return;
		}

		const verdict = this.options.classify(url, response.status, response);
		if (verdict === 'ignore') {
			await drainStream(response.body);
			return;
		}

		if (verdict === 'failed') {
			await drainStream(response.body);
			this.reportUnverifiable(
				url,
				status,
				`the target page answered ${response.status} when requested again`,
				response,
			);
			return;
		}

		if (!response.body) {
			this.reportUnverifiable(
				url,
				status,
				'the target page returned no body when requested again',
				response,
			);
			return;
		}

		// A page that is not HTML cannot offer fragments at all, which is how the
		// crawl treats it too.
		if (!isHtml(response)) {
			await drainStream(response.body);
			return;
		}

		const html = await bufferStream(toNodeReadable(response.body));
		await this.validate(url, html, status || response.status);
	}

	/** Record what a page offers and report the fragments it does not. */
	private report(url: string, validIds: Set<string>, status: number): void {
		const fragments = this.requested.get(url);
		if (!fragments) {
			return;
		}

		const results = validateFragmentsAgainstIds(validIds, fragments.keys());
		for (const { fragment, isValid } of results) {
			if (isValid) {
				continue;
			}
			for (const parent of fragments.get(fragment) ?? []) {
				if (this.claim(url, fragment, parent)) {
					this.options.reportBroken({ url, fragment, parent, status });
				}
			}
		}
	}

	/** Report every fragment of a target whose ids could not be learned. */
	private reportUnverifiable(
		url: string,
		status: number,
		reason: string,
		cause?: Error | HttpResponse,
	): void {
		const fragments = this.requested.get(url);
		if (!fragments) {
			return;
		}

		for (const [fragment, parents] of fragments) {
			for (const parent of parents) {
				if (this.claim(url, fragment, parent)) {
					this.options.reportUnverified({
						url,
						fragment,
						parent,
						status,
						reason,
						cause,
					});
				}
			}
		}
	}

	/**
	 * Take ownership of reporting one fragment on one referring page, so the
	 * validation and deferred paths never report the same pair twice.
	 * @returns Whether the caller is the first to report this pair
	 */
	private claim(url: string, fragment: string, parent: string): boolean {
		// A JSON array keeps the three parts distinct. Any separator a URL allows
		// can also occur inside them, so concatenation would let different triples
		// produce the same key.
		const key = JSON.stringify([url, fragment, parent]);
		if (this.reported.has(key)) {
			return false;
		}
		this.reported.add(key);
		return true;
	}

	private async shouldSkip(fragment: string, url: string): Promise<boolean> {
		const { fragmentsToSkip } = this.options.checkOptions;
		if (typeof fragmentsToSkip === 'function') {
			return fragmentsToSkip(fragment, url);
		}

		return Boolean(
			fragmentsToSkip?.some((fragmentToSkip) =>
				new RegExp(fragmentToSkip).test(fragment),
			),
		);
	}
}
