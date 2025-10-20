import { EventEmitter } from 'node:events';
import type * as http from 'node:http';
import type { AddressInfo } from 'node:net';
import * as path from 'node:path';
import process from 'node:process';
import { getLinks } from './links.js';
import {
	type CheckOptions,
	type InternalCheckOptions,
	processOptions,
} from './options.js';
import { Queue } from './queue.js';
import { startWebServer } from './server.js';

export { getConfig } from './config.js';

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

export type HttpResponse = {
	status: number;
	headers: Record<string, string>;
	body?: ReadableStream;
	url?: string;
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
	delayCache: Map<string, number>;
	retryErrorsCache: Map<string, number>;
	checkOptions: CheckOptions;
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
	on(event: 'link', listener: (result: LinkResult) => void): this;
	on(event: 'pagestart', listener: (link: string) => void): this;
	on(event: 'retry', listener: (details: RetryInfo) => void): this;
	on(event: 'redirect', listener: (details: RedirectInfo) => void): this;
	on(
		event: 'httpInsecure',
		listener: (details: HttpInsecureInfo) => void,
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

		const results: LinkResult[] = [];
		const initCache = new Set<string>();
		const relationshipCache = new Set<string>();
		const pendingChecks = new Map<string, Promise<void>>();
		const delayCache = new Map<string, number>();
		const retryErrorsCache = new Map<string, number>();

		for (const path of options.path) {
			const url = new URL(path);
			initCache.add(url.href);

			// Create a promise for this starting page so other pages can wait for it
			const crawlPromise = (async () => {
				await this.crawl({
					url,
					crawl: true,
					checkOptions: options,
					results,
					cache: initCache,
					relationshipCache,
					pendingChecks,
					delayCache,
					retryErrorsCache,
					queue,
					rootPath: path,
					retry: Boolean(options_.retry),
					retryErrors: Boolean(options_.retryErrors),
					retryErrorsCount: options_.retryErrorsCount ?? 5,
					retryErrorsJitter: options_.retryErrorsJitter ?? 3000,
				});
			})();

			// Store the promise
			pendingChecks.set(url.href, crawlPromise);

			// Queue the crawl
			queue.add(() => crawlPromise);
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
			return;
		}

		// Check for a user-configured function to filter out links
		if (
			typeof options.checkOptions.linksToSkip === 'function' &&
			(await options.checkOptions.linksToSkip(options.url.href))
		) {
			const result: LinkResult = {
				url: mapUrl(options.url.href, options.checkOptions),
				state: LinkState.SKIPPED,
				parent: options.parent,
			};
			options.results.push(result);
			this.emit('link', result);
			return;
		}

		// Check for a user-configured array of link regular expressions that should be skipped
		if (Array.isArray(options.checkOptions.linksToSkip)) {
			const skips = options.checkOptions.linksToSkip
				.map((linkToSkip) => {
					return new RegExp(linkToSkip).test(options.url.href);
				})
				.filter(Boolean);

			if (skips.length > 0) {
				const result: LinkResult = {
					url: mapUrl(options.url.href, options.checkOptions),
					state: LinkState.SKIPPED,
					parent: mapUrl(options.parent, options.checkOptions),
				};
				options.results.push(result);
				this.emit('link', result);
				return;
			}
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
		let response: HttpResponse | undefined;
		const failures: Array<Error | HttpResponse> = [];
		const originalUrl = options.url.href;
		const redirectMode =
			options.checkOptions.redirects === 'error' ? 'manual' : 'follow';

		try {
			response = await makeRequest(
				options.crawl ? 'GET' : 'HEAD',
				options.url.href,
				{
					headers: options.checkOptions.headers,
					timeout: options.checkOptions.timeout,
					redirect: redirectMode,
				},
			);
			if (this.shouldRetryAfter(response, options)) {
				return;
			}

			// If we got an HTTP 405, the server may not like HEAD. GET instead!
			if (response.status === 405) {
				response = await makeRequest('GET', options.url.href, {
					headers: options.checkOptions.headers,
					timeout: options.checkOptions.timeout,
					redirect: redirectMode,
				});
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
				response = await makeRequest('GET', options.url.href, {
					headers: options.checkOptions.headers,
					timeout: options.checkOptions.timeout,
					redirect: redirectMode,
				});
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
			shouldRecurse = isHtml(response);
		}

		// If retryErrors is enabled, retry 5xx and 0 status (which indicates
		// a network error likely occurred) or 429 without retry-after data:
		if (this.shouldRetryOnError(status, options)) {
			return;
		}

		// Detect if this was a redirect
		const redirect = detectRedirect(status, originalUrl, response);

		// Special handling for bot protection responses
		// Status 999: Used by LinkedIn and other sites to block automated requests
		// Status 403 with cf-mitigated: Cloudflare bot protection challenge
		// Since we cannot distinguish between valid and invalid URLs when blocked,
		// treat these as skipped rather than broken.
		if (status === 999) {
			state = LinkState.SKIPPED;
		} else if (
			status === 403 &&
			response !== undefined &&
			response.headers['cf-mitigated']
		) {
			state = LinkState.SKIPPED;
		}
		// Handle 'error' mode - treat any redirect as broken
		else if (
			options.checkOptions.redirects === 'error' &&
			redirect.isRedirect
		) {
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
		// Handle 'warn' mode - allow but warn on redirects
		else if (options.checkOptions.redirects === 'warn') {
			// Check if a redirect happened (either 3xx status or URL changed)
			if (redirect.isRedirect || redirect.wasFollowed) {
				// Emit warning about redirect
				this.emit('redirect', {
					url: originalUrl,
					targetUrl: redirect.targetUrl,
					// Report actual redirect status if we have it, otherwise 200
					status: redirect.isRedirect ? status : 200,
					isNonStandard: redirect.isNonStandard,
				});
			}
			// Still check final status for success/failure
			if (status >= 200 && status < 300) {
				state = LinkState.OK;
			} else if (
				redirect.isRedirect &&
				redirect.wasFollowed &&
				response?.body
			) {
				// Non-standard redirect with content - treat as OK even in warn mode
				state = LinkState.OK;
			} else if (response !== undefined) {
				failures.push(response);
			}
		}
		// Handle 'allow' mode (default) - accept 2xx or non-standard redirects with content
		else if (status >= 200 && status < 300) {
			state = LinkState.OK;
		} else if (redirect.isRedirect && redirect.wasFollowed && response?.body) {
			// Non-standard redirect with content - treat as OK in allow mode
			state = LinkState.OK;
		} else if (response !== undefined) {
			failures.push(response);
		}

		// Handle HTTPS enforcement
		const isHttpUrl = originalUrl.startsWith('http://');
		if (isHttpUrl && options.checkOptions.requireHttps === 'error') {
			// Treat HTTP as broken in error mode
			state = LinkState.BROKEN;
			failures.push(
				new Error(`HTTP link detected (${originalUrl}) but HTTPS is required`),
			);
		} else if (isHttpUrl && options.checkOptions.requireHttps === 'warn') {
			// Emit warning about HTTP link in warn mode
			this.emit('httpInsecure', {
				url: originalUrl,
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
			let urlResults: Awaited<ReturnType<typeof getLinks>> = [];
			if (response?.body) {
				// Fetch returns a Web ReadableStream (browser standard), but htmlparser2
				// requires a Node.js Readable stream for piping. This conversion allows
				// streaming HTML parsing as the response arrives, which is more memory
				// efficient than loading the full response into memory first.
				const { Readable } = await import('node:stream');
				const nodeStream = Readable.fromWeb(response.body as never);
				// Use the final URL after redirects (if available) as the base for resolving
				// relative links. This ensures relative links are resolved correctly even when
				// the original URL doesn't have a trailing slash but redirects to one.
				const baseUrl = response.url || options.url.href;
				urlResults = await getLinks(nodeStream, baseUrl);
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

					// Create a promise that will resolve when the check completes
					const checkPromise = (async () => {
						if (result.url === undefined) {
							throw new Error('url is undefined');
						}
						await this.crawl({
							url: result.url,
							crawl: crawl ?? false,
							cache: options.cache,
							relationshipCache: options.relationshipCache,
							pendingChecks: options.pendingChecks,
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
					})();

					// Store the promise so other parents can wait for it
					options.pendingChecks.set(result.url.href, checkPromise);

					// Queue the check
					options.queue.add(() => checkPromise);
				} else {
					// URL is being checked or has been checked
					// Wait for the existing check to complete, then reuse the result
					const urlHref = result.url.href;
					const parentHref = options.url.href;
					const pendingCheck = options.pendingChecks.get(urlHref);

					// Always queue the reuse operation to ensure proper sequencing
					options.queue.add(async () => {
						// If there's a pending check, wait for it
						if (pendingCheck) {
							await pendingCheck;
						}

						// Now the result should be in the results array
						const cachedResult = options.results.find(
							(r) => r.url === mapUrl(urlHref, options.checkOptions),
						);

						if (cachedResult) {
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
		}
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
 * Checks to see if a given source is HTML.
 * @param {object} response Page response.
 * @returns {boolean}
 */
function isHtml(response: HttpResponse): boolean {
	const contentType = (response.headers['content-type'] as string) || '';
	return (
		Boolean(/text\/html/g.test(contentType)) ||
		Boolean(/application\/xhtml\+xml/g.test(contentType))
	);
}

/**
 * When running a local static web server for the user, translate paths from
 * the Url generated back to something closer to a local filesystem path.
 * @example
 *    http://localhost:0000/test/route/README.md => test/route/README.md
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

	// Trim the starting http://localhost:0000 if we stood up a local static server
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
 * Helper function to make HTTP requests using native fetch
 * @param method HTTP method
 * @param url URL to request
 * @param options Additional options (headers, timeout)
 * @returns Response with status, headers, and body stream
 */
async function makeRequest(
	method: string,
	url: string,
	options: {
		headers?: Record<string, string>;
		timeout?: number;
		redirect?: 'follow' | 'manual';
	} = {},
): Promise<HttpResponse> {
	// Build browser-like headers to avoid bot detection
	const defaultHeaders: Record<string, string> = {
		Accept:
			'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
		'Accept-Language': 'en-US,en;q=0.9',
		'Accept-Encoding': 'gzip, deflate, br',
		'Cache-Control': 'no-cache',
		Pragma: 'no-cache',
		'Sec-Fetch-Dest': 'document',
		'Sec-Fetch-Mode': 'navigate',
		'Sec-Fetch-Site': 'none',
		'Upgrade-Insecure-Requests': '1',
	};

	const requestOptions: RequestInit = {
		method,
		headers: { ...defaultHeaders, ...options.headers },
		redirect: options.redirect ?? 'follow',
	};

	if (options.timeout) {
		requestOptions.signal = AbortSignal.timeout(options.timeout);
	}

	const response = await fetch(url, requestOptions);

	// Convert headers to a plain object
	const headers: Record<string, string> = {};
	response.headers.forEach((value: string, key: string) => {
		headers[key] = value;
	});

	const status = response.status;

	return {
		status,
		headers,
		body: (response.body ?? undefined) as ReadableStream | undefined,
		url: response.url,
	};
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
	const hasLocation = Boolean(response?.headers.location);
	const hasBody = response?.body !== undefined;

	// Non-standard redirect: 3xx status without Location header or with body
	const isNonStandard =
		isRedirectStatus && (!hasLocation || (hasBody && !hasLocation));

	return {
		isRedirect: isRedirectStatus,
		wasFollowed: Boolean(urlChanged || (isRedirectStatus && hasBody)),
		isNonStandard,
		targetUrl: response?.url || response?.headers.location,
	};
}

export type { CheckOptions } from './options.js';
