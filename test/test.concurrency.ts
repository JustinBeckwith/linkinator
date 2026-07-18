import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, assert, describe, it } from 'vitest';
import { check } from '../src/index.js';

describe('concurrency', () => {
	let server: http.Server | undefined;

	afterEach(async () => {
		if (server) {
			await new Promise<void>((resolve, reject) => {
				server?.close((error) => (error ? reject(error) : resolve()));
			});
			server = undefined;
		}
	});

	it('limits concurrent HTTP requests end to end', async () => {
		let activeRequests = 0;
		let maxActiveRequests = 0;

		server = http.createServer(async (request, response) => {
			activeRequests++;
			maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
			try {
				if (request.url === '/') {
					response.setHeader('content-type', 'text/html');
					response.end(
						Array.from(
							{ length: 12 },
							(_, index) => `<a href="/${index + 1}">link</a>`,
						).join('\n'),
					);
					return;
				}

				await new Promise((resolve) => setTimeout(resolve, 25));
				response.writeHead(200).end();
			} finally {
				activeRequests--;
			}
		});

		await new Promise<void>((resolve, reject) => {
			server?.once('error', reject).listen(0, '127.0.0.1', resolve);
		});
		const { port } = server.address() as AddressInfo;

		const results = await check({
			path: `http://127.0.0.1:${port}/`,
			concurrency: 3,
		});

		assert.ok(results.passed);
		assert.strictEqual(results.links.length, 13);
		assert.strictEqual(maxActiveRequests, 3);
	});

	it('limits concurrent starting URLs end to end', async () => {
		let activeRequests = 0;
		let maxActiveRequests = 0;

		server = http.createServer(async (_request, response) => {
			activeRequests++;
			maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
			try {
				await new Promise((resolve) => setTimeout(resolve, 25));
				response.writeHead(200, { 'content-type': 'text/plain' }).end();
			} finally {
				activeRequests--;
			}
		});

		await new Promise<void>((resolve, reject) => {
			server?.once('error', reject).listen(0, '127.0.0.1', resolve);
		});
		const { port } = server.address() as AddressInfo;

		const results = await check({
			path: Array.from(
				{ length: 12 },
				(_, index) => `http://127.0.0.1:${port}/${index + 1}`,
			),
			concurrency: 3,
		});

		assert.ok(results.passed);
		assert.strictEqual(results.links.length, 12);
		assert.strictEqual(maxActiveRequests, 3);
	});
});
