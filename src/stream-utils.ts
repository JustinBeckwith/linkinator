import { Readable } from 'node:stream';

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
