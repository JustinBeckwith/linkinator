import { Readable } from 'node:stream';
/**
 * Drains a response body stream without consuming its data.
 * This is important for connection pooling - if the body is not consumed,
 * the underlying TCP connection may not be returned to the pool, leading
 * to port exhaustion under high load.
 * @param body The response body stream to drain
 */
export declare function drainStream(body: ReadableStream | Readable | undefined): Promise<void>;
/**
 * Converts a response body stream to a Node.js Readable stream.
 * Handles both Web ReadableStreams (from fetch) and Node.js Readable streams (from local server).
 * @param body The response body stream
 * @returns A Node.js Readable stream
 */
export declare function toNodeReadable(body: ReadableStream | Readable): Readable;
/**
 * Buffers a stream's contents into a single Buffer.
 * @param stream The stream to buffer
 * @returns Promise that resolves to the buffered content
 */
export declare function bufferStream(stream: Readable): Promise<Buffer>;
