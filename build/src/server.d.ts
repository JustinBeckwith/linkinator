/// <reference types="node" />
import * as http from 'http';
export interface WebServerOptions {
    root: string;
    port?: number;
    markdown?: boolean;
    directoryListing?: boolean;
}
/**
 * Spin up a local HTTP server to serve static requests from disk
 * @private
 * @returns Promise that resolves with the instance of the HTTP server
 */
export declare function startWebServer(options: WebServerOptions): Promise<http.Server>;
