import { EventEmitter } from 'node:events';
import type * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';
import process from 'node:process';
import { Readable } from 'node:stream';
import { FragmentChecker } from './fragments.js';
import { getCssLinks, getLinks } from './links.js';
import {
	type CheckOptions,
	type InternalCheckOptions,
	processOptions,
	type StatusCodeAction,
} from './options.js';
import { Queue } from './queue.js';
import {
	type HttpResponse,
	isCss,
	isHtml,
	makeRequest,
	type RedirectTarget,
	type RequestResponse,
} from './request.js';
import { startWebServer, stopWebServer } from './server.js';
import { bufferStream, drainStream, toNodeReadable } from './stream-utils.js';

const STATIC_SERVER_HOST = '127.0.0.1';

export { getConfig } from './config.js';
export { type HttpResponse, resetSharedAgents } from './request.js';

export enum LinkState {
	OK = 'OK',
	BROKEN = 'BROKEN',
	SKIPPED = 'SKIPPED',
}

export type RetryInfo = {
	url: string;
	secondsUntilRetry: number;
	status: number;
};

export type RedirectInfo = {
	url: string;
	targetUrl?: string;
	status: number;
	isNonStandard: boolean;
};

export type HttpInsecureInfo = {
	url: string;
};

export type StatusCodeWarning = {
	url: string;
	status: number;
};

/** A fragment link whose target could not be read, so it was never checked. */
export type FragmentUnverifiedInfo = {
	/** The target page, without the fragment. */
	url: string;
	/** The fragment identifier, without the leading `#`. */
	fragment: string;
	/** The page that contains the link. */
	parent: string;
	/** Status the target answered with during the crawl. */
	status: number;
	/** Why the target could not be read. */
	reason: string;
};

export type LinkResult = {
	url: string;
	status?: number;
	state: LinkState;
	parent?: string;
	failureDetails?: Array<Error | HttpResponse>;
};

export type CrawlResult = {
	passed: boolean;
	links: LinkResult[];
};

type CrawlOptions = {
	url: URL;
	parent?: string;
	crawl: boolean;
	results: LinkResult[];
	cache: Set<string>;
	relationshipCache: Set<string>;
	pendingChecks: Map<string, Promise<void>>;
	fragments: FragmentChecker;
	delayCache: Map<string, number>;
	retryErrorsCache: Map<string, number>;
	checkOptions: InternalCheckOptions;
	queue: Queue;
	rootPath: string;
	retry: boolean;
	retryErrors: boolean;
	retryErrorsCount: number;
	retryErrorsJitter: number;
};

/**
 * Instance class used to perform a crawl job.
 */
export class LinkChecker extends EventEmitter {
	/**
	 * Register a crawl as pending, then start it only after the queue grants a
	 * concurrency slot. The separate completion promise lets duplicate links
	 * wait for the original check without starting that check eagerly.
	 */
	private enqueueCrawl(options: CrawlOptions): Promise<void> {
		let resolveCompletion: () => void;
		const completion = new Promise<void>((resolve) => {
			resolveCompletion = resolve;
		});

		options.pendingChecks.set(options.url.href, completion);
		options.queue.add(async () => {
			try {
				await this.crawl(options);
			} finally {
				resolveCompletion();
			}
		});

		return completion;
	}

	on(event: 'link', listener: (result: LinkResult) => void): this;
	on(event: 'pagestart', listener: (link: string) => void): this;
	on(event: 'retry', listener: (details: RetryInfo) => void): this;
	on(event: 'redirect', listener: (details: RedirectInfo) => void): this;
	on(
		event: 'httpInsecure',
		listener: (details: HttpInsecureInfo) => void,
	): this;
	on(
		event: 'statusCodeWarning',
		listener: (details: StatusCodeWarning) => void,
	): this;
	on(
		event: 'fragmentUnverified',
		listener: (details: FragmentUnverifiedInfo) => void,
	): this;
	// biome-ignore lint/suspicious/noExplicitAny: this can in fact be generic
	on(event: string | symbol, listener: (...arguments_: any[]) => void): this {
		return super.on(event, listener);
	}

	/**
	 * Crawl a given url or path, and return a list of visited links along with
	 * status codes.
	 * @param options Options to use while checking for 404s
	 */
	async check(options_: CheckOptions) {
		const options = await processOptions(options_);
		if (!Array.isArray(options.path)) {
			options.path = [options.path];
		}

		options.linksToSkip ||= [];
		let server: http.Server | undefined;
		const hasHttpPaths = options.path.find((x) => x.startsWith('http'));
		if (!hasHttpPaths) {
			let { port } = options;
			server = await startWebServer({
				root: options.serverRoot ?? '',
				port,
				host: STATIC_SERVER_HOST,
				markdown: options.markdown,
				directoryListing: options.directoryListing,
				cleanUrls: options.cleanUrls,
			});

			if (port === undefined) {
				const addr = server.address() as AddressInfo;
				port = addr.port;
			}

			for (let i = 0; i < options.path.length; i++) {
				if (options.path[i].startsWith('/')) {
					options.path[i] = options.path[i].slice(1);
				}

				options.path[i] =
					`http://${STATIC_SERVER_HOST}:${port}/${options.path[i]}`;
			}

			options.staticHttpServerHost = `http://${STATIC_SERVER_HOST}:${port}/`;
		}

		if (process.env.LINKINATOR_DEBUG) {
			console.log(options);
		}

		const queue = new Queue({
			concurrency: options.concurrency || 100,
		});

		const results: LinkResult[] = [];
		const initCache = new Set<string>();
		const relationshipCache = new Set<string>();
		const pendingChecks = new Map<string, Promise<void>>();
		const delayCache = new Map<string, number>();
		const retryErrorsCache = new Map<string, number>();
		const fragments = new FragmentChecker({
			checkOptions: options,
			pageStatus: (url) =>
				results.find(
					(result) =>
						result.url === mapUrl(url, options) &&
						result.state === LinkState.OK,
				)?.status,
			reportSkipped: (urlWithFragment, parent) => {
				this.recordResult(results, {
					url: mapUrl(urlWithFragment, options),
					state: LinkState.SKIPPED,
					parent: mapUrl(parent, options),
				});
			},
			reportBroken: ({ url, fragment, parent, status }) => {
				this.recordResult(results, {
					url: mapUrl(`${url}#${fragment}`, options),
					status,
					state: LinkState.BROKEN,
					parent: mapUrl(parent, options),
					failureDetails: [
						new Error(`Fragment identifier '#${fragment}' not found on page`),
					],
				});
			},
			reportUnverified: ({ url, fragment, parent, status, reason, cause }) => {
				// An unchecked fragment is reported as broken rather than dropped:
				// dropping it is indistinguishable from a valid fragment in the
				// result, which is the false negative this whole path exists to
				// avoid. The event carries the distinction for consumers that need
				// it.
				const failureDetails: Array<Error | HttpResponse> = [
					new Error(
						`Fragment identifier '#${fragment}' could not be verified: ${reason}`,
					),
				];
				if (cause) {
					failureDetails.push(cause);
				}

				this.recordResult(results, {
					url: mapUrl(`${url}#${fragment}`, options),
					status,
					state: LinkState.BROKEN,
					parent: mapUrl(parent, options),
					failureDetails,
				});
				this.emit('fragmentUnverified', {
					url: mapUrl(url, options),
					fragment,
					parent: mapUrl(parent, options),
					status,
					reason,
				});
			},
		});

		for (const path of options.path) {
			const url = new URL(path);
			initCache.add(url.href);

			this.enqueueCrawl({
				url,
				crawl: true,
				checkOptions: options,
				results,
				cache: initCache,
				relationshipCache,
				pendingChecks,
				fragments,
				delayCache,
				retryErrorsCache,
				queue,
				rootPath: path,
				retry: Boolean(options_.retry),
				retryErrors: Boolean(options_.retryErrors),
				retryErrorsCount: options_.retryErrorsCount ?? 5,
				retryErrorsJitter: options_.retryErrorsJitter ?? 3000,
			});
		}

		await queue.onIdle();

		// Fragments discovered after their target page was already fetched cannot
		// be validated during the crawl, since each page is only fetched once.
		// Resolve those now that every link is known.
		if (options.checkFragments) {
			for (const task of fragments.deferredTasks()) {
				queue.add(task);
			}
			await queue.onIdle();
		}

		const result = {
			links: results,
			passed: results.filter((x) => x.state === LinkState.BROKEN).length === 0,
		};
		if (server) {
			await stopWebServer(server);
		}

		return result;
	}

	/**
	 * Crawl a given url with the provided options.
	 * @pram opts List of options used to do the crawl
	 * @private
	 * @returns A list of crawl results consisting of urls and status codes
	 */
	async crawl(options: CrawlOptions): Promise<void> {
		options.url.href = this.rewriteUrl(options.url.href, options.checkOptions);

		if (await this.shouldSkipUrl(options.url.href, options.checkOptions)) {
			this.recordSkippedResult(options);
			return;
		}

		// Check if this host has been marked for delay due to 429
		if (options.delayCache.has(options.url.host)) {
			const timeout = options.delayCache.get(options.url.host);
			if (timeout === undefined) {
				throw new Error('timeout not found');
			}
			if (timeout > Date.now()) {
				options.queue.add(
					async () => {
						await this.crawl(options);
					},
					{
						delay: timeout - Date.now(),
					},
				);
				return;
			}
		}

		// Perform a HEAD or GET request based on the need to crawl
		let status = 0;
		let state = LinkState.BROKEN;
		let shouldRecurse = false;
		let response: RequestResponse | undefined;
		const failures: Array<Error | HttpResponse> = [];
		const originalUrl = options.url.href;
		const redirectMode =
			options.checkOptions.redirects === 'error' ? 'manual' : 'follow';
		const processRedirectTarget =
			redirectMode === 'follow' &&
			(this.hasSkipRules(options.checkOptions) ||
				Boolean(options.checkOptions.urlRewriteExpressions?.length))
				? (url: string) => this.processRedirectTarget(url, options.checkOptions)
				: undefined;
		const requestOptions = {
			headers: options.checkOptions.headers,
			timeout: options.checkOptions.timeout,
			redirect: redirectMode,
			allowInsecureCerts: options.checkOptions.allowInsecureCerts,
			processRedirectTarget,
		} as const;

		try {
			response = await makeRequest(
				options.crawl ? 'GET' : 'HEAD',
				options.url.href,
				requestOptions,
			);
			if (response.redirectSkipped) {
				this.recordSkippedResult(options);
				return;
			}
			if (this.shouldRetryAfter(response, options)) {
				return;
			}

			// If we got an HTTP 405, the server may not like HEAD. GET instead!
			if (response.status === 405) {
				response = await makeRequest('GET', options.url.href, requestOptions);
				if (response.redirectSkipped) {
					this.recordSkippedResult(options);
					return;
				}
				if (this.shouldRetryAfter(response, options)) {
					return;
				}
			}
		} catch (error) {
			// Request failure: invalid domain name, etc.
			// this also occasionally catches too many redirects, but is still valid (e.g. https://www.ebay.com)
			// for this reason, we also try doing a GET below to see if the link is valid
			failures.push(error as Error);
		}

		try {
			// Some sites don't respond well to HEAD requests, even if they don't return a 405.
			// This is a last gasp effort to see if the link is valid.
			if (
				(response === undefined ||
					response.status < 200 ||
					response.status >= 300) &&
				!options.crawl
			) {
				response = await makeRequest('GET', options.url.href, requestOptions);
				if (response.redirectSkipped) {
					this.recordSkippedResult(options);
					return;
				}
				if (this.shouldRetryAfter(response, options)) {
					return;
				}
			}
		} catch (error) {
			failures.push(error as Error);
			// Catch the next failure
		}

		if (response !== undefined) {
			status = response.status;
			shouldRecurse =
				isHtml(response) ||
				(isCss(response) && options.checkOptions.checkCss === true);
		}

		// If we want to recurse into a CSS file and we used HEAD, we need to do a GET
		// to get the body for parsing URLs (only if checkCss is enabled)
		if (
			shouldRecurse &&
			response !== undefined &&
			isCss(response) &&
			!response.body &&
			options.crawl &&
			options.checkOptions.checkCss
		) {
			try {
				response = await makeRequest('GET', options.url.href, requestOptions);
				if (response.redirectSkipped) {
					this.recordSkippedResult(options);
					return;
				}
				if (response !== undefined) {
					status = response.status;
				}
			} catch (error) {
				failures.push(error as Error);
			}
		}

		// If we need to check fragments and we used HEAD, we need to do a GET
		// to get the HTML body for parsing fragment IDs
		if (
			options.checkOptions.checkFragments &&
			response !== undefined &&
			isHtml(response) &&
			!response.body
		) {
			if (options.fragments.wants(options.url.href)) {
				try {
					response = await makeRequest('GET', options.url.href, requestOptions);
					if (response.redirectSkipped) {
						this.recordSkippedResult(options);
						return;
					}
					if (response !== undefined) {
						status = response.status;
					}
				} catch (error) {
					failures.push(error as Error);
				}
			}
		}

		// If retryErrors is enabled, retry 5xx and 0 status (which indicates
		// a network error likely occurred) or 429 without retry-after data:
		if (this.shouldRetryOnError(status, options)) {
			return;
		}

		const classification = classifyResponse(
			status,
			response,
			originalUrl,
			options.checkOptions,
		);
		state = classification.state;
		failures.push(...classification.failures);
		for (const warning of classification.warnings) {
			this.emit(warning.event, warning.payload);
		}

		const result: LinkResult = {
			url: mapUrl(options.url.href, options.checkOptions),
			status,
			state,
			parent: mapUrl(options.parent, options.checkOptions),
			failureDetails: failures,
		};
		options.results.push(result);
		this.emit('link', result);

		// A target that is not HTML cannot offer fragments, so record that now
		// rather than requesting it again once the crawl is done.
		if (
			options.checkOptions.checkFragments &&
			response !== undefined &&
			!isHtml(response)
		) {
			options.fragments.markUnusable(options.url.href);
		}

		// Check for fragment identifiers if needed (before we start crawling deeper)
		// Only validate fragments if the base URL returned a successful (2xx) response
		if (
			options.checkOptions.checkFragments &&
			response?.body &&
			isHtml(response) &&
			state === LinkState.OK
		) {
			if (options.fragments.wants(options.url.href)) {
				// Convert and buffer the response body
				const nodeStream = toNodeReadable(response.body);
				const htmlContent = await bufferStream(nodeStream);

				await options.fragments.validate(
					options.url.href,
					htmlContent,
					response.status,
				);

				// Create a new stream from the buffered content for link extraction
				const linkStream = Readable.from([htmlContent]);
				response.body = linkStream as never;
			}
		}

		// If we need to go deeper, scan the next level of depth for links and crawl
		if (options.crawl && shouldRecurse) {
			this.emit('pagestart', options.url);
			let urlResults: Awaited<ReturnType<typeof getLinks>> = [];
			let htmlContentForFragments: Buffer | undefined;
			if (response?.body) {
				// Convert to Node.js Readable stream (handles both Web and Node.js streams)
				const nodeStream = toNodeReadable(response.body);

				// Use the final URL after redirects (if available) as the base for resolving
				// relative links. This ensures relative links are resolved correctly even when
				// the original URL doesn't have a trailing slash but redirects to one.
				// Resolve links against the final response URL exactly as a browser does.
				// In particular, an extensionless URL without a trailing slash is still
				// a document URL; inventing a slash changes the meaning of relative links.
				const baseUrl = response.url || options.url.href;

				// Parse HTML or CSS depending on content type
				if (isHtml(response)) {
					// If we're checking fragments, buffer the HTML content so we can validate
					// same-page fragments after extracting links
					if (options.checkOptions.checkFragments) {
						htmlContentForFragments = await bufferStream(nodeStream);
						// Create a new stream from the buffer for link extraction
						const linkStream = Readable.from([htmlContentForFragments]);
						urlResults = await getLinks(
							linkStream,
							baseUrl,
							options.checkOptions.checkCss,
						);
					} else {
						urlResults = await getLinks(
							nodeStream,
							baseUrl,
							options.checkOptions.checkCss,
						);
					}
				} else if (isCss(response) && options.checkOptions.checkCss) {
					urlResults = await getCssLinks(nodeStream, baseUrl);
				}
			}
			for (const result of urlResults) {
				// If there was some sort of problem parsing the link while
				// creating a new URL obj, treat it as a broken link.
				if (!result.url) {
					const r = {
						url: mapUrl(result.link, options.checkOptions),
						status: 0,
						state: LinkState.BROKEN,
						parent: mapUrl(options.url.href, options.checkOptions),
					};
					options.results.push(r);
					this.emit('link', r);
					continue;
				}

				// Requests are deduplicated by the fragmentless URL, but skip rules
				// should see the complete URL as it appeared in the document.
				if (
					this.hasSkipRules(options.checkOptions) &&
					(result.url.protocol === 'http:' ||
						result.url.protocol === 'https:') &&
					result.urlWithFragment &&
					(await this.shouldSkipUrl(
						result.urlWithFragment,
						options.checkOptions,
					))
				) {
					const skippedResult: LinkResult = {
						url: mapUrl(result.urlWithFragment, options.checkOptions),
						state: LinkState.SKIPPED,
						parent: mapUrl(options.url.href, options.checkOptions),
					};
					options.results.push(skippedResult);
					this.emit('link', skippedResult);
					continue;
				}

				// Track fragments that need validation if checkFragments is enabled
				if (
					options.checkOptions.checkFragments &&
					result.fragment &&
					result.fragment.length > 0
				) {
					await options.fragments.record({
						// The fragment target has to be keyed the way the crawl will
						// record it, which is after the rewrite.
						url: this.rewriteUrl(result.url.href, options.checkOptions),
						fragment: result.fragment,
						urlWithFragment: result.urlWithFragment,
						parent: options.url.href,
					});
				}

				let crawl =
					options.checkOptions.recurse &&
					result.url?.href.startsWith(options.rootPath);

				// Only crawl links that start with the same host
				if (crawl) {
					try {
						const pathUrl = new URL(options.rootPath);
						crawl = result.url.host === pathUrl.host;
					} catch {
						// ignore errors
					}
				}

				// Create a unique key for this URL-parent relationship
				// Use the current page (options.url.href) as the parent in the relationship
				const relationshipKey = `${result.url.href}|${options.url.href}`;

				// Check if we've already reported this specific relationship
				if (options.relationshipCache.has(relationshipKey)) {
					continue;
				}

				// Mark this relationship as seen
				options.relationshipCache.add(relationshipKey);

				// Check if URL has been HTTP-checked before
				const inCache = options.cache.has(result.url.href);

				if (!inCache) {
					// URL hasn't been checked, add to cache and create a promise for the check
					options.cache.add(result.url.href);

					if (result.url === undefined) {
						throw new Error('url is undefined');
					}
					this.enqueueCrawl({
						url: result.url,
						crawl: crawl ?? false,
						cache: options.cache,
						relationshipCache: options.relationshipCache,
						pendingChecks: options.pendingChecks,
						fragments: options.fragments,
						delayCache: options.delayCache,
						retryErrorsCache: options.retryErrorsCache,
						results: options.results,
						checkOptions: options.checkOptions,
						queue: options.queue,
						parent: options.url.href,
						rootPath: options.rootPath,
						retry: options.retry,
						retryErrors: options.retryErrors,
						retryErrorsCount: options.retryErrorsCount,
						retryErrorsJitter: options.retryErrorsJitter,
					});
				} else {
					// URL is being checked or has been checked
					// Only report duplicate results for BROKEN links so users can see
					// all parents that reference broken URLs. For OK/SKIPPED links,
					// we don't need to report them multiple times as this causes
					// massive result inflation for heavily interlinked sites.
					const urlHref = result.url.href;
					const parentHref = options.url.href;
					const pendingCheck = options.pendingChecks.get(urlHref);

					// Queue the reuse operation to check if the link is broken
					options.queue.add(async () => {
						// If there's a pending check, wait for it
						if (pendingCheck) {
							await pendingCheck;
						}

						// Now the result should be in the results array
						const cachedResult = options.results.find(
							(r) => r.url === mapUrl(urlHref, options.checkOptions),
						);

						// Only emit duplicate results for BROKEN links
						if (cachedResult && cachedResult.state === LinkState.BROKEN) {
							const reusedResult: LinkResult = {
								url: cachedResult.url,
								status: cachedResult.status,
								state: cachedResult.state,
								parent: mapUrl(parentHref, options.checkOptions),
								failureDetails: cachedResult.failureDetails,
							};
							options.results.push(reusedResult);
							this.emit('link', reusedResult);
						}
					});
				}
			}

			// Validate fragments that point at this page, including the ones this
			// page links to itself, which are only known after link extraction.
			if (
				options.checkOptions.checkFragments &&
				htmlContentForFragments &&
				response &&
				isHtml(response) &&
				state === LinkState.OK
			) {
				await options.fragments.validate(
					options.url.href,
					htmlContentForFragments,
					response.status,
				);
			}
		}

		// Drain any unconsumed response body to release the connection back to the pool.
		// This is critical for preventing port exhaustion - if the body isn't consumed,
		// the underlying TCP connection may not be reused.
		await drainStream(response?.body);
	}

	private hasSkipRules(checkOptions: InternalCheckOptions): boolean {
		return (
			typeof checkOptions.linksToSkip === 'function' ||
			(Array.isArray(checkOptions.linksToSkip) &&
				checkOptions.linksToSkip.length > 0)
		);
	}

	private rewriteUrl(href: string, checkOptions: InternalCheckOptions): string {
		let rewrittenUrl = href;
		for (const expression of checkOptions.urlRewriteExpressions ?? []) {
			rewrittenUrl = rewrittenUrl.replace(
				expression.pattern,
				expression.replacement,
			);
		}
		return rewrittenUrl;
	}

	private async processRedirectTarget(
		href: string,
		checkOptions: InternalCheckOptions,
	): Promise<RedirectTarget> {
		const url = this.rewriteUrl(href, checkOptions);
		return {
			url,
			shouldSkip: await this.shouldSkipUrl(url, checkOptions),
		};
	}

	private async shouldSkipUrl(
		href: string,
		checkOptions: InternalCheckOptions,
	): Promise<boolean> {
		const url = new URL(href);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') {
			return true;
		}

		if (typeof checkOptions.linksToSkip === 'function') {
			return checkOptions.linksToSkip(href);
		}

		return Boolean(
			checkOptions.linksToSkip?.some((linkToSkip) =>
				new RegExp(linkToSkip).test(href),
			),
		);
	}

	/** Store a result and hand it to any listener. */
	private recordResult(results: LinkResult[], result: LinkResult): void {
		results.push(result);
		this.emit('link', result);
	}

	private recordSkippedResult(options: CrawlOptions): void {
		const result: LinkResult = {
			url: mapUrl(options.url.href, options.checkOptions),
			status:
				options.url.protocol === 'http:' || options.url.protocol === 'https:'
					? undefined
					: 0,
			state: LinkState.SKIPPED,
			parent: mapUrl(options.parent, options.checkOptions),
		};
		options.results.push(result);
		this.emit('link', result);
	}

	/**
	 * Parse the retry-after header value into a timestamp.
	 * Supports standard formats (seconds, HTTP date) and non-standard formats (30s, 1m30s).
	 * @param retryAfterRaw Raw retry-after header value
	 * @returns Timestamp in milliseconds when to retry, or NaN if invalid
	 */
	private parseRetryAfter(retryAfterRaw: string): number {
		// Try parsing as seconds
		let retryAfter = Number(retryAfterRaw) * 1000 + Date.now();
		if (!Number.isNaN(retryAfter)) return retryAfter;

		// Try parsing as HTTP date
		retryAfter = Date.parse(retryAfterRaw);
		if (!Number.isNaN(retryAfter)) return retryAfter;

		// Handle non-standard formats like "30s" or "1m30s"
		const matches = retryAfterRaw.match(/^(?:(\d+)m)?(\d+)s$/);
		if (!matches) return Number.NaN;

		return (
			(Number(matches[1] || 0) * 60 + Number(matches[2])) * 1000 + Date.now()
		);
	}

	/**
	 * Check the incoming response for a `retry-after` header.  If present,
	 * and if the status was an HTTP 429, calculate the date at which this
	 * request should be retried. Ensure the delayCache knows that we're
	 * going to wait on requests for this entire host.
	 * @param response HttpResponse returned from the request
	 * @param opts CrawlOptions used during this request
	 */
	shouldRetryAfter(response: HttpResponse, options: CrawlOptions): boolean {
		if (!options.retry) {
			return false;
		}

		const retryAfterRaw = response.headers['retry-after'] as string;
		if (response.status !== 429 || !retryAfterRaw) {
			return false;
		}

		const retryAfter = this.parseRetryAfter(retryAfterRaw);
		if (Number.isNaN(retryAfter)) {
			return false;
		}

		// Check to see if there is already a request to wait for this host
		const currentTimeout = options.delayCache.get(options.url.host);
		if (currentTimeout !== undefined) {
			// Use whichever time is higher in the cache
			if (retryAfter > currentTimeout) {
				options.delayCache.set(options.url.host, retryAfter);
			}
		} else {
			options.delayCache.set(options.url.host, retryAfter);
		}

		options.queue.add(
			async () => {
				await this.crawl(options);
			},
			{
				delay: retryAfter - Date.now(),
			},
		);
		const retryDetails: RetryInfo = {
			url: options.url.href,
			status: response.status,
			secondsUntilRetry: Math.round((retryAfter - Date.now()) / 1000),
		};
		this.emit('retry', retryDetails);
		return true;
	}

	/**
	 * If the response is a 5xx, synthetic 0 or 429 without retry-after header retry N times.
	 * There are cases where we can get 429 but without retry-after data, for those cases we
	 * are going to handle it as error so we can retry N times.
	 * @param status Status returned by request or 0 if request threw.
	 * @param opts CrawlOptions used during this request
	 */
	shouldRetryOnError(status: number, options: CrawlOptions): boolean {
		const maxRetries = options.retryErrorsCount;

		if (!options.retryErrors) {
			return false;
		}

		// Only retry 0 and >5xx or 429 without retry-after header status codes:
		if (status > 0 && status < 500 && status !== 429) {
			return false;
		}

		const retriesScheduled =
			options.retryErrorsCache.get(options.url.href) ?? 0;
		if (retriesScheduled >= maxRetries) {
			return false;
		}

		const currentRetry = retriesScheduled + 1;
		options.retryErrorsCache.set(options.url.href, currentRetry);

		// Use exponential backoff algorithm to take pressure off upstream service:
		const retryAfter =
			2 ** currentRetry * 1000 + Math.random() * options.retryErrorsJitter;

		options.queue.add(
			async () => {
				await this.crawl(options);
			},
			{
				delay: retryAfter,
			},
		);
		const retryDetails: RetryInfo = {
			url: options.url.href,
			status,
			secondsUntilRetry: Math.round(retryAfter / 1000),
		};
		this.emit('retry', retryDetails);
		return true;
	}
}

/**
 * Convenience method to perform a scan.
 * @param options CheckOptions to be passed on
 */
export async function check(options: CheckOptions) {
	const checker = new LinkChecker();
	const results = await checker.check(options);
	return results;
}

/**
 * When running a local static web server for the user, translate paths from
 * the Url generated back to something closer to a local filesystem path.
 * @example
 *    http://127.0.0.1:0000/test/route/README.md => test/route/README.md
 * @param url The url that was checked
 * @param options Original CheckOptions passed into the client
 */
function mapUrl<T extends string | undefined>(
	url: T,
	options?: InternalCheckOptions,
): T {
	if (!url) {
		return url;
	}

	let newUrl = url as string;

	// Trim the starting http://127.0.0.1:0000 if we stood up a local static server
	if (
		options?.staticHttpServerHost?.length &&
		url?.startsWith(options.staticHttpServerHost)
	) {
		newUrl = url.slice(options.staticHttpServerHost.length);

		// Add the full filesystem path back if we trimmed it
		if (options?.syntheticServerRoot?.length) {
			newUrl = path.join(options.syntheticServerRoot, newUrl);
		}

		if (newUrl === '') {
			newUrl = `.${path.sep}`;
		}
	}

	return newUrl as T;
}

/**
 * Checks if a status code matches a pattern (e.g., "403", "4xx", "5xx").
 *
 * @param status - HTTP status code to check
 * @param pattern - Pattern to match against (specific code like "403" or wildcard like "4xx")
 * @returns True if the status matches the pattern
 */
function matchesStatusCodePattern(status: number, pattern: string): boolean {
	// Exact match (e.g., "403")
	if (pattern === status.toString()) {
		return true;
	}

	// Pattern match (e.g., "4xx", "5xx")
	// The pattern should be in the form "Xxx" where X is the first digit and xx are wildcards
	if (pattern.endsWith('xx') && pattern.length === 3) {
		const firstDigit = pattern[0];
		const statusFirstDigit = Math.floor(status / 100).toString();
		return firstDigit === statusFirstDigit;
	}

	return false;
}

/**
 * Gets the configured action for a given status code.
 * Checks exact matches first, then patterns (4xx, 5xx).
 *
 * @param status - HTTP status code
 * @param statusCodes - Configuration mapping status codes/patterns to actions
 * @returns The action to take, or undefined if no match
 */
function getStatusCodeAction(
	status: number,
	statusCodes?: Record<string, StatusCodeAction>,
): StatusCodeAction | undefined {
	if (!statusCodes) {
		return undefined;
	}

	// Check for exact match first (e.g., "403")
	const exactMatch = statusCodes[status.toString()];
	if (exactMatch) {
		return exactMatch;
	}

	// Check for pattern matches (e.g., "4xx", "5xx")
	for (const [pattern, action] of Object.entries(statusCodes)) {
		if (matchesStatusCodePattern(status, pattern)) {
			return action;
		}
	}

	return undefined;
}

type ResponseWarning =
	| { event: 'statusCodeWarning'; payload: StatusCodeWarning }
	| { event: 'redirect'; payload: RedirectInfo }
	| { event: 'httpInsecure'; payload: HttpInsecureInfo };

/** How a response was graded, and what the caller still has to report. */
type ResponseClassification = {
	state: LinkState;
	/** Failures to add to the ones the request itself already produced. */
	failures: Array<Error | HttpResponse>;
	/** Events for the caller to emit, so this stays a pure function. */
	warnings: ResponseWarning[];
};

/**
 * Grade a response: custom status code actions first, then bot protection, then
 * the configured redirect mode, then HTTPS enforcement. Every path that has to
 * decide whether a page counts as reachable goes through here, so the crawl and
 * the deferred fragment re-request cannot disagree about which pages are
 * acceptable.
 * @param status Status the request ended with, or 0 when it never answered
 * @param response The response, when there was one
 * @param originalUrl URL as requested, before any redirect was followed
 * @param checkOptions Options for this run
 * @returns The state to report, plus failures to record and warnings to emit
 */
function classifyResponse(
	status: number,
	response: HttpResponse | undefined,
	originalUrl: string,
	checkOptions: InternalCheckOptions,
): ResponseClassification {
	const failures: Array<Error | HttpResponse> = [];
	const warnings: ResponseWarning[] = [];
	let state = LinkState.BROKEN;

	const redirect = detectRedirect(status, originalUrl, response);
	const customAction = getStatusCodeAction(status, checkOptions.statusCodes);

	if (customAction === 'ok') {
		state = LinkState.OK;
	} else if (customAction === 'warn') {
		// Treated as success, but the caller is told about it.
		state = LinkState.OK;
		warnings.push({
			event: 'statusCodeWarning',
			payload: { url: originalUrl, status },
		});
	} else if (customAction === 'skip') {
		state = LinkState.SKIPPED;
	} else if (customAction === 'error') {
		state = LinkState.BROKEN;
		if (response !== undefined) {
			failures.push(response);
		}
	}
	// Bot protection responses cannot be told apart from a genuinely broken
	// link, so they are skipped rather than reported. Status 999 is used by
	// LinkedIn and others; a 403 carrying `cf-mitigated` is a Cloudflare
	// challenge.
	else if (status === 999) {
		state = LinkState.SKIPPED;
	} else if (
		status === 403 &&
		response !== undefined &&
		response.headers['cf-mitigated']
	) {
		state = LinkState.SKIPPED;
	}
	// 'error' mode - any redirect is a failure
	else if (checkOptions.redirects === 'error' && redirect.isRedirect) {
		state = LinkState.BROKEN;
		const targetInfo = redirect.targetUrl ? ` to ${redirect.targetUrl}` : '';
		failures.push({
			status,
			headers: response?.headers || {},
		});
		failures.push(
			new Error(
				`Redirect detected (${originalUrl}${targetInfo}) but redirects are disabled`,
			),
		);
	}
	// 'warn' mode - allowed, but reported, and the final status still decides
	else if (checkOptions.redirects === 'warn') {
		if (redirect.isRedirect || redirect.wasFollowed) {
			warnings.push({
				event: 'redirect',
				payload: {
					url: originalUrl,
					targetUrl: redirect.targetUrl,
					// Report the actual redirect status when there is one, otherwise 200
					status: redirect.isRedirect ? status : 200,
					isNonStandard: redirect.isNonStandard,
				},
			});
		}

		if (status >= 200 && status < 300) {
			state = LinkState.OK;
		} else if (redirect.isRedirect && redirect.wasFollowed && response?.body) {
			// A non-standard redirect that carried content is still reachable
			state = LinkState.OK;
		} else if (response !== undefined) {
			failures.push(response);
		}
	}
	// 'allow' mode (default) - 2xx, or a non-standard redirect with content
	else if (status >= 200 && status < 300) {
		state = LinkState.OK;
	} else if (redirect.isRedirect && redirect.wasFollowed && response?.body) {
		state = LinkState.OK;
	} else if (response !== undefined) {
		failures.push(response);
	}

	// HTTPS enforcement. The bundled static server is exempt because it cannot
	// serve HTTPS.
	const isHttpUrl = originalUrl.startsWith('http://');
	const isLocalStaticServer = Boolean(
		checkOptions.staticHttpServerHost &&
			originalUrl.startsWith(checkOptions.staticHttpServerHost),
	);

	if (
		isHttpUrl &&
		!isLocalStaticServer &&
		checkOptions.requireHttps === 'error'
	) {
		state = LinkState.BROKEN;
		failures.push(
			new Error(`HTTP link detected (${originalUrl}) but HTTPS is required`),
		);
	} else if (
		isHttpUrl &&
		!isLocalStaticServer &&
		checkOptions.requireHttps === 'warn'
	) {
		warnings.push({ event: 'httpInsecure', payload: { url: originalUrl } });
	}

	return { state, failures, warnings };
}

/**
 * Helper function to detect if a redirect occurred
 * @param status HTTP status code
 * @param originalUrl Original URL requested
 * @param response HTTP response object
 * @returns Redirect detection details
 */
function detectRedirect(
	status: number,
	originalUrl: string,
	response?: HttpResponse,
): {
	isRedirect: boolean;
	wasFollowed: boolean;
	isNonStandard: boolean;
	targetUrl?: string;
} {
	const isRedirectStatus = status >= 300 && status < 400;
	const urlChanged = response?.url && response.url !== originalUrl;
	const location = response?.headers.location;
	const hasLocation = location !== undefined;
	const hasBody = response?.body !== undefined;
	let targetUrl: string | undefined;

	if (isRedirectStatus && hasLocation) {
		// Manual mode leaves response.url at the requested URL. The Location header
		// identifies this redirect's immediate destination without following it.
		try {
			targetUrl = new URL(location, response?.url || originalUrl).href;
		} catch {
			// Preserve malformed Location values for diagnostics instead of hiding them.
			targetUrl = location;
		}
	} else if (urlChanged) {
		// A followed redirect has no Location header on its final response, so the
		// response URL is the best available destination.
		targetUrl = response.url;
	}

	// Non-standard redirect: 3xx status without a Location header.
	const isNonStandard = isRedirectStatus && !hasLocation;

	return {
		isRedirect: isRedirectStatus,
		wasFollowed: Boolean(urlChanged || (isRedirectStatus && hasBody)),
		isNonStandard,
		targetUrl,
	};
}

export type { CheckOptions } from './options.js';
