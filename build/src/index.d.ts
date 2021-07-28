/// <reference types="node" />
import { EventEmitter } from 'events';
import { URL } from 'url';
import { GaxiosResponse } from 'gaxios';
import { Queue } from './queue';
import { CheckOptions } from './options';
export { CheckOptions };
export declare enum LinkState {
    OK = "OK",
    BROKEN = "BROKEN",
    SKIPPED = "SKIPPED"
}
export interface RetryInfo {
    url: string;
    secondsUntilRetry: number;
    status: number;
}
export interface LinkResult {
    url: string;
    status?: number;
    state: LinkState;
    parent?: string;
    failureDetails?: {}[];
}
export interface CrawlResult {
    passed: boolean;
    links: LinkResult[];
}
interface CrawlOptions {
    url: URL;
    parent?: string;
    crawl: boolean;
    results: LinkResult[];
    cache: Set<string>;
    delayCache: Map<string, number>;
    checkOptions: CheckOptions;
    queue: Queue;
    rootPath: string;
    retry: boolean;
}
export declare const headers: {
    'User-Agent': string;
};
export declare interface LinkChecker {
    on(event: 'link', listener: (result: LinkResult) => void): this;
    on(event: 'pagestart', listener: (link: string) => void): this;
    on(event: 'retry', listener: (details: RetryInfo) => void): this;
}
/**
 * Instance class used to perform a crawl job.
 */
export declare class LinkChecker extends EventEmitter {
    /**
     * Crawl a given url or path, and return a list of visited links along with
     * status codes.
     * @param options Options to use while checking for 404s
     */
    check(opts: CheckOptions): Promise<{
        links: LinkResult[];
        passed: boolean;
    }>;
    /**
     * Crawl a given url with the provided options.
     * @pram opts List of options used to do the crawl
     * @private
     * @returns A list of crawl results consisting of urls and status codes
     */
    crawl(opts: CrawlOptions): Promise<void>;
    /**
     * Check the incoming response for a `retry-after` header.  If present,
     * and if the status was an HTTP 429, calculate the date at which this
     * request should be retried. Ensure the delayCache knows that we're
     * going to wait on requests for this entire host.
     * @param res GaxiosResponse returned from the request
     * @param opts CrawlOptions used during this request
     */
    shouldRetryAfter(res: GaxiosResponse, opts: CrawlOptions): boolean;
}
/**
 * Convenience method to perform a scan.
 * @param options CheckOptions to be passed on
 */
export declare function check(options: CheckOptions): Promise<{
    links: LinkResult[];
    passed: boolean;
}>;
