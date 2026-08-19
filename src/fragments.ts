import { Readable } from 'node:stream';
import {
	extractFragmentIds,
	isSoftNotFound,
	validateFragmentsAgainstIds,
} from './links.js';
import type { InternalCheckOptions } from './options.js';
import { isHtml, makeRequest, type RequestResponse } from './request.js';
import { bufferStream, drainStream, toNodeReadable } from './stream-utils.js';

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

export type FragmentCheckerOptions = {
	checkOptions: InternalCheckOptions;
	/**
	 * Status of an already-crawled page, or undefined when it was not reachable.
	 * A page that failed is reported broken in its own right, and cannot be
	 * asked which fragments it offers.
	 */
	pageStatus: (url: string) => number | undefined;
	/** Called for fragments excluded by the skip rules. */
	reportSkipped: (urlWithFragment: string, parent: string) => void;
	/** Called once per broken fragment and referring page. */
	reportBroken: (fragment: BrokenFragment) => void;
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
 *    {@link validate} with its body. It answers whatever fragments are pending
 *    for that page and records each outcome, so the same fragment found on a
 *    later page costs nothing. Call it even when no fragment is known to point
 *    at the page yet - it is a no-op then. {@link wants} works in the opposite
 *    direction: it reports whether a body that is not otherwise needed is worth
 *    fetching, so a HEAD request can be upgraded to a GET.
 * 3. **Deferred.** Once crawling is finished, run every thunk returned by
 *    {@link deferredTasks}. These settle the fragments that were discovered
 *    after their target page had already been fetched, re-requesting only those
 *    pages whose ids are still unknown. Skipping this step silently loses
 *    findings, which is the bug this class is built around.
 *
 * Results leave through the `reportSkipped` and `reportBroken` callbacks rather
 * than being returned, because they are produced in all three steps. Each
 * broken fragment is reported once per referring page, and never twice for the
 * same pair, so steps 2 and 3 may both look at the same page.
 *
 * One instance belongs to one crawl: it accumulates state for every page seen
 * and is not meant to be reused for a second run.
 *
 * @example
 * ```ts
 * const fragments = new FragmentChecker({
 * 	checkOptions,
 * 	pageStatus: (url) => statusOfCrawledPage(url),
 * 	reportSkipped: (urlWithFragment, parent) => report(...),
 * 	reportBroken: ({ url, fragment, parent, status }) => report(...),
 * });
 *
 * // while crawling a page
 * for (const link of linksOnPage) {
 * 	await fragments.record({ url: link.url, fragment: link.fragment, parent: pageUrl });
 * }
 * await fragments.validate(pageUrl, pageBody, pageStatus);
 *
 * // once the crawl is done
 * for (const task of fragments.deferredTasks()) {
 * 	queue.add(task);
 * }
 * await queue.onIdle();
 * ```
 */
export class FragmentChecker {
	/** Target URL -> fragment -> pages that link to it. */
	private readonly requested = new Map<string, Map<string, Set<string>>>();
	/** Target URL -> fragment -> whether the page offers it. */
	private readonly outcomes = new Map<string, Map<string, boolean>>();
	/** `url|fragment|parent` triples already reported. */
	private readonly reported = new Set<string>();

	constructor(private readonly options: FragmentCheckerOptions) {}

	/**
	 * Whether this page has pending fragments that its HTML is still needed for.
	 * Lets the caller turn a HEAD request into a GET only when it pays off.
	 * @param url Page URL, without a fragment
	 */
	wants(url: string): boolean {
		const pending = this.requested.get(url);
		if (!pending) {
			return false;
		}
		const outcomes = this.outcomes.get(url);
		return [...pending.keys()].some((fragment) => !outcomes?.has(fragment));
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
	 * Answer every fragment pending for a page from its HTML, and remember which
	 * ids it offers so fragments discovered later need no second request. Does
	 * nothing when no fragment points at the page, or when the page looks like a
	 * soft 404 and its ids therefore mean nothing.
	 * @param url Page URL, without a fragment
	 * @param html The page's body
	 * @param status Status the page responded with
	 */
	async validate(url: string, html: Buffer, status: number): Promise<void> {
		if (!this.wants(url) || isSoftNotFound(html)) {
			return;
		}

		const validIds = await extractFragmentIds(Readable.from([html]));
		this.report(url, validIds, status);
	}

	/**
	 * Work left over once crawling is done: the fragments whose target page was
	 * already fetched before they were discovered. Pages whose ids are known are
	 * settled without a request; the rest are fetched once more.
	 * @returns One thunk per page, to be run by the caller's queue
	 */
	deferredTasks(): Array<() => Promise<void>> {
		const tasks: Array<() => Promise<void>> = [];
		for (const [url, fragments] of this.requested) {
			const status = this.options.pageStatus(url);
			if (!this.wants(url)) {
				this.reportKnownOutcomes(url, fragments, status ?? 0);
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
	 * Report fragments already known to be missing, for pages that linked them
	 * after the target page was validated.
	 */
	private reportKnownOutcomes(
		url: string,
		fragments: Map<string, Set<string>>,
		status: number,
	): void {
		const outcomes = this.outcomes.get(url);
		for (const [fragment, parents] of fragments) {
			if (outcomes?.get(fragment) !== false) {
				continue;
			}
			for (const parent of parents) {
				this.reportOnce({ url, fragment, parent, status });
			}
		}
	}

	/**
	 * Request a page again to learn which fragments it offers. Response bodies
	 * are single-use streams and are deliberately not cached, so this is the only
	 * way to answer fragments discovered after the page was crawled.
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
		} catch {
			// The page answered during the crawl, so a failure here says nothing
			// about its fragments. Leave them unvalidated rather than reporting a
			// breakage that cannot be confirmed.
			return;
		}

		if (
			!response.body ||
			!isHtml(response) ||
			response.status < 200 ||
			response.status >= 300
		) {
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

		let outcomes = this.outcomes.get(url);
		if (!outcomes) {
			outcomes = new Map();
			this.outcomes.set(url, outcomes);
		}

		const results = validateFragmentsAgainstIds(validIds, fragments.keys());
		for (const { fragment, isValid } of results) {
			outcomes.set(fragment, isValid);
			if (isValid) {
				continue;
			}
			for (const parent of fragments.get(fragment) ?? []) {
				this.reportOnce({ url, fragment, parent, status });
			}
		}
	}

	/** Report a broken fragment unless the same page already reported it. */
	private reportOnce(fragment: BrokenFragment): void {
		const key = `${fragment.url}|${fragment.fragment}|${fragment.parent}`;
		if (this.reported.has(key)) {
			return;
		}
		this.reported.add(key);
		this.options.reportBroken(fragment);
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
