import { EventEmitter } from 'node:events';
import type * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import process from 'node:process';
import { getLinks } from './links.js';
import { type CheckOptions, processOptions } from './options.js';
import { Queue } from './queue.js';
import { startWebServer } from './server.js';
import {
	type FailureDetails,
	type LinkResult,
	LinkState,
	type RetryInfo,
} from './types.js';
import { createFetchOptions, isHtml, mapUrl } from './utils.js';

export type CrawlOptions = {
	url: URL;
	parent?: string;
	crawl: boolean;
	results: LinkResult[];
	cache: Set<string>;
	delayCache: Map<string, number>;
	retryErrorsCache: Map<string, number>;
	checkOptions: CheckOptions;
	queue: Queue;
	rootPath: string;
	retry: boolean;
	retryErrors: boolean;
	retryErrorsCount: number;
	retryErrorsJitter: number;
	extraHeaders: { [key: string]: string };
};

/**
 * Instance class used to perform a crawl job.
 */
export class LinkChecker extends EventEmitter {
	on(event: 'link', listener: (result: LinkResult) => void): this;
	on(event: 'pagestart', listener: (link: string) => void): this;
	on(event: 'retry', listener: (details: RetryInfo) => void): this;
	// biome-ignore lint/suspicious/noExplicitAny: <explanation>
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
				markdown: options.markdown,
				directoryListing: options.directoryListing,
			});
			if (port === undefined) {
				const addr = server.address() as AddressInfo;
				port = addr.port;
			}

			for (let i = 0; i < options.path.length; i++) {
				if (options.path[i].startsWith('/')) {
					options.path[i] = options.path[i].slice(1);
				}

				options.path[i] = `http://localhost:${port}/${options.path[i]}`;
			}

			options.staticHttpServerHost = `http://localhost:${port}/`;
		}

		if (process.env.LINKINATOR_DEBUG) {
			console.log(options);
		}

		const queue = new Queue({
			concurrency: options.concurrency || 100,
		});

		const results = new Array<LinkResult>();
		const initCache = new Set<string>();
		const delayCache = new Map<string, number>();
		const retryErrorsCache = new Map<string, number>();

		for (const path of options.path) {
			const url = new URL(path);
			initCache.add(url.href);
			queue.add(async () => {
				await this.crawl({
					url,
					crawl: true,
					checkOptions: options,
					results,
					cache: initCache,
					delayCache,
					retryErrorsCache,
					queue,
					rootPath: path,
					retry: Boolean(options_.retry),
					retryErrors: Boolean(options_.retryErrors),
					retryErrorsCount: options_.retryErrorsCount ?? 5,
					retryErrorsJitter: options_.retryErrorsJitter ?? 3000,
					extraHeaders: options.extraHeaders ?? {},
				});
			});
		}

		await queue.onIdle();

		const result = {
			links: results,
			passed: results.filter((x) => x.state === LinkState.BROKEN).length === 0,
		};
		if (server) {
			server.destroy();
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
		// Apply any regex url replacements
		if (options.checkOptions.urlRewriteExpressions) {
			for (const exp of options.checkOptions.urlRewriteExpressions) {
				const newUrl = options.url.href.replace(exp.pattern, exp.replacement);
				if (options.url.href !== newUrl) {
					options.url.href = newUrl;
				}
			}
		}

		// Explicitly skip non-http[s] links before making the request
		if (this.skipProtocol(options)) {
			return;
		}

		// Check for a user-configured function to filter out links
		if (await this.skipLinksFunction(options)) {
			return;
		}

		// Check for a user-provided array of links to filter out
		if (this.skipLinksArray(options)) {
			return;
		}

		// Check if this host has been marked for delay due to 429
		if (this.handleExistingDelay(options)) {
			return;
		}

		// Perform a HEAD or GET request based on the need to crawl
		let status = 0;
		let state = LinkState.BROKEN;
		let shouldRecurse = false;
		let response: Response | undefined = undefined;
		const failures: Array<FailureDetails> = [];
		const fetchOptions = createFetchOptions(options);

		try {
			response = await fetch(options.url.href, {
				method: options.crawl ? 'GET' : 'HEAD',
				...fetchOptions,
			});
			if (this.shouldRetryAfter(response, options)) {
				return;
			}
			// If we got an HTTP 405, the server may not like HEAD. GET instead!
			if (response.status === 405) {
				response = await fetch(options.url.href, {
					method: 'GET',
					...fetchOptions,
				});
				if (this.shouldRetryAfter(response, options)) {
					return;
				}
			}
		} catch (error) {
			// Request failure: invalid domain name, etc.
			// this also occasionally catches too many redirects, but is still valid (e.g. https://www.ebay.com)
			// for this reason, we also try doing a GET below to see if the link is valid
			failures.push({
				cause: (error as Error).cause,
				message: (error as Error).message,
			});
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
				response = await fetch(options.url.href, {
					method: 'GET',
					...fetchOptions,
				});
				if (this.shouldRetryAfter(response, options)) {
					return;
				}
			}
		} catch (error) {
			failures.push({
				cause: (error as Error).cause,
				message: (error as Error).message,
			});
			// Catch the next failure
		}
		if (response !== undefined) {
			status = response.status;
			shouldRecurse = isHtml(response);
		}
		// If retryErrors is enabled, retry 5xx and 0 status (which indicates
		// a network error likely occurred):
		if (this.shouldRetryOnError(status, options)) {
			return;
		}

		// Assume any 2xx status is 👌
		if (status >= 200 && status < 300) {
			state = LinkState.OK;
		} else if (response !== undefined) {
			failures.push({
				status: response.status,
				statusText: response.statusText,
				headers: Object.fromEntries(response.headers),
				ok: response.ok,
				url: response.url,
				body: response.body,
			});
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

		// If we need to go deeper, scan the next level of depth for links and crawl
		if (options.crawl && shouldRecurse) {
			this.emit('pagestart', options.url);
			const urlResults = response?.body
				? await getLinks(response.body, options.url.href)
				: [];
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

				// Ensure the url hasn't already been touched, largely to avoid a
				// very large queue length and runaway memory consumption
				if (!options.cache.has(result.url.href)) {
					options.cache.add(result.url.href);
					options.queue.add(async () => {
						if (result.url === undefined) {
							throw new Error('url is undefined');
						}
						await this.crawl({
							url: result.url,
							crawl: crawl ?? false,
							cache: options.cache,
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
							extraHeaders: options.extraHeaders,
						});
					});
				}
			}
		}
	}

	/**
	 * Check the incoming response for a `retry-after` header.  If present,
	 * and if the status was an HTTP 429, calculate the date at which this
	 * request should be retried. Ensure the delayCache knows that we're
	 * going to wait on requests for this entire host.
	 * @param response Response returned from the request
	 * @param opts CrawlOptions used during this request
	 */
	shouldRetryAfter(response: Response, options: CrawlOptions): boolean {
		if (!options.retry) {
			return false;
		}

		const retryAfterRaw = response.headers.get('retry-after');
		if (response.status !== 429 || !retryAfterRaw) {
			return false;
		}

		// The `retry-after` header can come in either <seconds> or
		// A specific date to go check.
		let retryAfter = Number(retryAfterRaw) * 1000 + Date.now();
		if (Number.isNaN(retryAfter)) {
			retryAfter = Date.parse(retryAfterRaw);
			if (Number.isNaN(retryAfter)) {
				return false;
			}
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
	 * If the response is a 5xx or synthetic 0 response retry N times.
	 * @param status Status returned by request or 0 if request threw.
	 * @param opts CrawlOptions used during this request
	 */
	shouldRetryOnError(status: number, options: CrawlOptions): boolean {
		const maxRetries = options.retryErrorsCount;

		if (!options.retryErrors) {
			return false;
		}

		// Only retry 0 and >5xx status codes:
		if (status > 0 && status < 500) {
			return false;
		}

		// Check to see if there is already a request to wait for this URL:
		let currentRetries = 1;
		const cachedRetries = options.retryErrorsCache.get(options.url.href);
		if (cachedRetries !== undefined) {
			// Use whichever time is higher in the cache
			currentRetries = cachedRetries;
			if (currentRetries > maxRetries) return false;
			options.retryErrorsCache.set(options.url.href, currentRetries + 1);
		} else {
			options.retryErrorsCache.set(options.url.href, 1);
		}

		// Use exponential backoff algorithm to take pressure off upstream service:
		const retryAfter =
			2 ** currentRetries * 1000 + Math.random() * options.retryErrorsJitter;

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

	/**
	 * Adds the link to the results as skipped and returns `true` when
	 * the protocol is not http or https.
	 */
	private skipProtocol(options: CrawlOptions): boolean {
		const proto = options.url.protocol;
		if (proto !== 'http:' && proto !== 'https:') {
			const r: LinkResult = {
				url: mapUrl(options.url.href, options.checkOptions),
				status: 0,
				state: LinkState.SKIPPED,
				parent: mapUrl(options.parent, options.checkOptions),
			};
			options.results.push(r);
			this.emit('link', r);
			return true;
		}
		return false;
	}

	/**
	 * Adds the link to the results as skipped and returns `true` when a function
	 * is defined as condition to skip links and calling the function with the
	 * URL returns true.
	 */
	private async skipLinksFunction(options: CrawlOptions): Promise<boolean> {
		const skipFn = options.checkOptions.linksToSkip;
		if (typeof skipFn === 'function' && (await skipFn(options.url.href))) {
			const result: LinkResult = {
				url: mapUrl(options.url.href, options.checkOptions),
				state: LinkState.SKIPPED,
				parent: options.parent,
			};
			options.results.push(result);
			this.emit('link', result);
			return true;
		}
		return false;
	}

	/**
	 * Adds the link to the results as skipped and returns `true` when an
	 * array of link patterns to skip has been configured and at least
	 * one of them matches.
	 */
	private skipLinksArray(options: CrawlOptions): boolean {
		const skipArr = options.checkOptions.linksToSkip;
		if (Array.isArray(skipArr)) {
			const found = skipArr.some((pattern) =>
				new RegExp(pattern).test(options.url.href),
			);
			if (found) {
				const result: LinkResult = {
					url: mapUrl(options.url.href, options.checkOptions),
					state: LinkState.SKIPPED,
					parent: mapUrl(options.parent, options.checkOptions),
				};
				options.results.push(result);
				this.emit('link', result);
				return true;
			}
		}
		return false;
	}

	/**
	 * Adds the link to the queue again and returns `true` when an existing
	 * active delay for this URL exists.
	 */
	private handleExistingDelay(options: CrawlOptions): boolean {
		const host = options.url.host;
		const timeout = options.delayCache.get(host);
		if (timeout === undefined) {
			return false;
		}
		if (timeout > Date.now()) {
			options.queue.add(
				async () => {
					await this.crawl(options);
				},
				{ delay: timeout - Date.now() },
			);
			return true;
		}
		return false;
	}
}
