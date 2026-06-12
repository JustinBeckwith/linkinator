export type UrlRewriteExpression = {
    pattern: RegExp;
    replacement: string;
};
export type StatusCodeAction = 'ok' | 'warn' | 'skip' | 'error';
export type CheckOptions = {
    concurrency?: number;
    port?: number;
    path: string | string[];
    recurse?: boolean;
    timeout?: number;
    markdown?: boolean;
    linksToSkip?: string[] | ((link: string) => Promise<boolean>);
    serverRoot?: string;
    directoryListing?: boolean;
    cleanUrls?: boolean;
    retry?: boolean;
    retryErrors?: boolean;
    retryErrorsCount?: number;
    retryErrorsJitter?: number;
    urlRewriteExpressions?: UrlRewriteExpression[];
    userAgent?: string;
    headers?: Record<string, string>;
    redirects?: 'allow' | 'warn' | 'error' | 'verify';
    requireHttps?: 'off' | 'warn' | 'error';
    allowInsecureCerts?: boolean;
    checkCss?: boolean;
    checkFragments?: boolean;
    statusCodes?: Record<string, StatusCodeAction>;
    rootPath?: string;
};
export type InternalCheckOptions = {
    syntheticServerRoot?: string;
    staticHttpServerHost?: string;
} & CheckOptions;
export declare const DEFAULT_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
/**
 * Validate the provided flags all work with each other.
 * @param options CheckOptions passed in from the CLI (or API)
 */
export declare function processOptions(options_: CheckOptions): Promise<InternalCheckOptions>;
