export interface Flags {
    concurrency?: number;
    config?: string;
    recurse?: boolean;
    skip?: string;
    format?: string;
    silent?: boolean;
    verbosity?: string;
    timeout?: number;
    markdown?: boolean;
    serverRoot?: string;
    directoryListing?: boolean;
    retry?: boolean;
    urlRewriteSearch?: string;
    urlRewriteReplace?: string;
}
export declare function getConfig(flags: Flags): Promise<Flags>;
