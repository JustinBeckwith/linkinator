import { Readable } from 'node:stream';

/**
 * Drains a response body stream without consuming its data.
 * This is important for connection pooling - if the body is not consumed,
 * the underlying TCP connection may not be returned to the pool, leading
 * to port exhaustion under high load.
 * @param body The response body stream to drain
 */
export async function drainStream(
	body: ReadableStream | Readable | undefined,
): Promise<void> {
	if (!body) return;

	try {
		if ('cancel' in body && typeof body.cancel === 'function') {
			// Web ReadableStream - cancel it to release the connection
			await body.cancel();
		} else if ('destroy' in body && typeof body.destroy === 'function') {
			// Node.js Readable stream - destroy it
			body.destroy();
		}
	} catch {
		// Ignore errors when draining - the connection will be cleaned up eventually
	}
}

/**
 * Converts a response body stream to a Node.js Readable stream.
 * Handles both Web ReadableStreams (from fetch) and Node.js Readable streams (from local server).
 * @param body The response body stream
 * @returns A Node.js Readable stream
 */
export function toNodeReadable(body: ReadableStream | Readable): Readable {
	// Check if body is already a Node.js Readable stream
	if (body && 'pipe' in body) {
		// Already a Node.js Readable stream (from local server)
		return body as Readable;
	}
	// Web ReadableStream (from fetch), convert it
	return Readable.fromWeb(body as never);
}

/**
 * Buffers a stream's contents into a single Buffer.
 * @param stream The stream to buffer
 * @returns Promise that resolves to the buffered content
 */
export async function bufferStream(stream: Readable): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const chunk of stream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}
