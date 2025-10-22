import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { bufferStream, toNodeReadable } from '../src/stream-utils.js';

describe('stream utilities', () => {
	describe('toNodeReadable', () => {
		it('should return Node.js Readable stream as-is', () => {
			const nodeStream = Readable.from(['hello', 'world']);
			const result = toNodeReadable(nodeStream);
			expect(result).toBe(nodeStream);
		});

		it('should convert Web ReadableStream to Node.js Readable', () => {
			// Create a Web ReadableStream
			const webStream = new ReadableStream({
				start(controller) {
					controller.enqueue('hello');
					controller.enqueue('world');
					controller.close();
				},
			});

			const result = toNodeReadable(webStream);
			expect(result).toBeInstanceOf(Readable);
			expect(result).not.toBe(webStream);
		});
	});

	describe('bufferStream', () => {
		it('should buffer a stream with Buffer chunks', async () => {
			const stream = Readable.from([
				Buffer.from('hello'),
				Buffer.from(' '),
				Buffer.from('world'),
			]);
			const result = await bufferStream(stream);
			expect(result).toBeInstanceOf(Buffer);
			expect(result.toString()).toBe('hello world');
		});

		it('should buffer a stream with string chunks', async () => {
			const stream = Readable.from(['hello', ' ', 'world']);
			const result = await bufferStream(stream);
			expect(result).toBeInstanceOf(Buffer);
			expect(result.toString()).toBe('hello world');
		});

		it('should handle empty streams', async () => {
			const stream = Readable.from([]);
			const result = await bufferStream(stream);
			expect(result).toBeInstanceOf(Buffer);
			expect(result.length).toBe(0);
		});

		it('should handle streams with mixed Buffer and string chunks', async () => {
			const stream = Readable.from(['hello', Buffer.from(' '), 'world']);
			const result = await bufferStream(stream);
			expect(result).toBeInstanceOf(Buffer);
			expect(result.toString()).toBe('hello world');
		});
	});
});
