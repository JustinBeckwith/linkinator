import { EventEmitter } from 'node:events';
/**
 * Reset the shared HTTP agents. This is primarily useful for testing
 * to ensure a fresh agent state between tests.
 */
export declare function resetSharedAgents(): void;
import { type CheckOptions, type InternalCheckOptions } from './options.js';
import { Queue } from './queue.js';
export { getConfig } from './config.js';
export declare enum LinkState {
    OK = "OK",
    BROKEN = "BROKEN",
    SKIPPED = "SKIPPED"
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
export declare class LinkChecker extends EventEmitter {
    private fragmentsToCheck;
    on(event: 'link', listener: (result: LinkResult) => void): this;
    on(event: 'pagestart', listener: (link: string) => void): this;
    on(event: 'retry', listener: (details: RetryInfo) => void): this;
    on(event: 'redirect', listener: (details: RedirectInfo) => void): this;
    on(event: 'httpInsecure', listener: (details: HttpInsecureInfo) => void): this;
    on(event: 'statusCodeWarning', listener: (details: StatusCodeWarning) => void): this;
    /**
     * Crawl a given url or path, and return a list of visited links along with
     * status codes.
     * @param options Options to use while checking for 404s
     */
    check(options_: CheckOptions): Promise<{
        links: LinkResult[];
        passed: boolean;
    }>;
    /**
     * Crawl a given url with the provided options.
     * @pram opts List of options used to do the crawl
     * @private
     * @returns A list of crawl results consisting of urls and status codes
     */
    crawl(options: CrawlOptions): Promise<void>;
    /**
     * Parse the retry-after header value into a timestamp.
     * Supports standard formats (seconds, HTTP date) and non-standard formats (30s, 1m30s).
     * @param retryAfterRaw Raw retry-after header value
     * @returns Timestamp in milliseconds when to retry, or NaN if invalid
     */
    private parseRetryAfter;
    /**
     * Check the incoming response for a `retry-after` header.  If present,
     * and if the status was an HTTP 429, calculate the date at which this
     * request should be retried. Ensure the delayCache knows that we're
     * going to wait on requests for this entire host.
     * @param response HttpResponse returned from the request
     * @param opts CrawlOptions used during this request
     */
    shouldRetryAfter(response: HttpResponse, options: CrawlOptions): boolean;
    /**
     * If the response is a 5xx, synthetic 0 or 429 without retry-after header retry N times.
     * There are cases where we can get 429 but without retry-after data, for those cases we
     * are going to handle it as error so we can retry N times.
     * @param status Status returned by request or 0 if request threw.
     * @param opts CrawlOptions used during this request
     */
    shouldRetryOnError(status: number, options: CrawlOptions): boolean;
}
/**
 * Convenience method to perform a scan.
 * @param options CheckOptions to be passed on
 */
export declare function check(options: CheckOptions): Promise<{
    links: LinkResult[];
    passed: boolean;
}>;
export type { CheckOptions } from './options.js';
