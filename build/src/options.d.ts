export interface UrlRewriteExpression {
    pattern: RegExp;
    replacement: string;
}
export interface CheckOptions {
    concurrency?: number;
    port?: number;
    path: string | string[];
    recurse?: boolean;
    timeout?: number;
    markdown?: boolean;
    linksToSkip?: string[] | ((link: string) => Promise<boolean>);
    serverRoot?: string;
    directoryListing?: boolean;
    retry?: boolean;
    urlRewriteExpressions?: UrlRewriteExpression[];
}
export interface InternalCheckOptions extends CheckOptions {
    syntheticServerRoot?: string;
    staticHttpServerHost?: string;
}
/**
 * Validate the provided flags all work with each other.
 * @param options CheckOptions passed in from the CLI (or API)
 */
export declare function processOptions(opts: CheckOptions): Promise<InternalCheckOptions>;
