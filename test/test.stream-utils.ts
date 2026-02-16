import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { resetSharedAgents } from '../src/index.js';
import {
	bufferStream,
	drainStream,
	toNodeReadable,
} from '../src/stream-utils.js';

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

	describe('drainStream', () => {
		it('should handle undefined body', async () => {
			await expect(drainStream(undefined)).resolves.toBeUndefined();
		});

		it('should drain a Web ReadableStream by canceling it', async () => {
			let canceled = false;
			const webStream = new ReadableStream({
				start(controller) {
					controller.enqueue('data');
				},
				cancel() {
					canceled = true;
				},
			});
			await drainStream(webStream);
			expect(canceled).toBe(true);
		});

		it('should drain a Node.js Readable stream by destroying it', async () => {
			let destroyed = false;
			const nodeStream = new Readable({
				read() {
					this.push('data');
				},
				destroy(_err, callback) {
					destroyed = true;
					callback(null);
				},
			});
			await drainStream(nodeStream);
			expect(destroyed).toBe(true);
		});

		it('should handle errors gracefully when draining', async () => {
			// Create a stream that throws when canceled
			const errorStream = {
				cancel: () => Promise.reject(new Error('Cancel failed')),
			} as unknown as ReadableStream;
			// Should not throw
			await expect(drainStream(errorStream)).resolves.toBeUndefined();
		});
	});

	describe('resetSharedAgents', () => {
		it('should reset the shared agent state', () => {
			// This function is primarily for testing purposes
			// Just verify it can be called without errors
			expect(() => resetSharedAgents()).not.toThrow();
		});
	});
});
