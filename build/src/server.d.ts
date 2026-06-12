import http from 'node:http';
export type WebServerOptions = {
    root: string;
    port?: number;
    host?: string;
    markdown?: boolean;
    directoryListing?: boolean;
    cleanUrls?: boolean;
};
/**
 * Spin up a local HTTP server to serve static requests from disk
 * @private
 * @returns Promise that resolves with the instance of the HTTP server
 */
export declare function startWebServer(options: WebServerOptions): Promise<http.Server<typeof http.IncomingMessage, typeof http.ServerResponse>>;
/**
 * Stop the given web server
 * @param server The server instance to stop
 * @returns Promise that resolves when the server is fully stopped
 */
export declare function stopWebServer(server: http.Server): Promise<void>;
