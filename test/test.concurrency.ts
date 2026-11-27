import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, assert, describe, it } from 'vitest';
import {
	check,
	LinkChecker,
	type LinkResult,
	LinkState,
} from '../src/index.js';

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

	for (const status of [200, 404]) {
		for (const concurrency of [1, 2, 5]) {
			it(`drains duplicate reports and cycles with status ${status}, concurrency ${concurrency}`, async () => {
				const requests = new Map<string, number>();
				server = http.createServer((request, response) => {
					const url = request.url as string;
					requests.set(url, (requests.get(url) ?? 0) + 1);
					response.setHeader('content-type', 'text/html');
					if (url === '/') {
						response.end(
							'<a href="/shared">root</a><a href="/a">a</a><a href="/b">b</a>',
						);
					} else if (url === '/shared') {
						response.writeHead(status).end();
					} else {
						const displayText = url === '/a' ? '/a' : '/b';
						response.end(
							`<a href="/shared">${displayText}</a><a href="/shared">same parent</a><a href="/">cycle</a>`,
						);
					}
				});
				await new Promise<void>((resolve, reject) => {
					server?.once('error', reject).listen(0, '127.0.0.1', resolve);
				});
				const { port } = server.address() as AddressInfo;
				const origin = `http://127.0.0.1:${port}`;
				const checker = new LinkChecker();
				const emitted: LinkResult[] = [];
				checker.on('link', (result) => emitted.push(result));
				const result = await checker.check({
					path: `${origin}/`,
					recurse: true,
					concurrency,
				});
				assert.deepStrictEqual(emitted, result.links);
				assert.strictEqual(result.passed, status === 200);
				assert.strictEqual(result.links.length, status === 200 ? 4 : 6);
				assert.deepStrictEqual([...requests.values()], [1, 1, 1, 1]);
				if (status === 404) {
					const broken = result.links.filter(
						(link) => link.state === LinkState.BROKEN,
					);
					assert.deepStrictEqual(broken.map((link) => link.parent).sort(), [
						`${origin}/`,
						`${origin}/a`,
						`${origin}/b`,
					]);
					assert.deepStrictEqual(
						broken.map((link) => link.displayText).sort(),
						['/a', '/b', 'root'],
					);
					assert.ok(broken.every((link) => link.status === 404));
				}
			});
		}

		it(`keeps crawling past a duplicate of a stalled ${status} response`, async () => {
			let stalledResponse: http.ServerResponse | undefined;
			let reachedHealthy: () => void;
			const healthyRequested = new Promise<void>((resolve) => {
				reachedHealthy = resolve;
			});
			server = http.createServer((request, response) => {
				response.setHeader('content-type', 'text/html');
				switch (request.url) {
					case '/':
						response.end(
							'<a href="/stalled">original</a><a href="/page">page</a>',
						);
						break;
					case '/page':
						response.end(
							'<a href="/stalled">duplicate</a><a href="/healthy">healthy</a>',
						);
						break;
					case '/stalled':
						stalledResponse = response;
						break;
					case '/healthy':
						reachedHealthy();
						response.end();
				}
			});
			await new Promise<void>((resolve, reject) => {
				server?.once('error', reject).listen(0, '127.0.0.1', resolve);
			});
			const { port } = server.address() as AddressInfo;
			const origin = `http://127.0.0.1:${port}`;
			const checker = new LinkChecker();
			const emitted: string[] = [];
			checker.on('link', (result) => emitted.push(result.url));
			const scan = checker.check({
				path: `${origin}/`,
				recurse: true,
				concurrency: 2,
			});
			let timer: NodeJS.Timeout | undefined;
			try {
				await Promise.race([
					healthyRequested,
					new Promise<never>((_, reject) => {
						timer = setTimeout(
							() => reject(new Error('Duplicate check blocked healthy URL')),
							2000,
						);
					}),
				]);
			} finally {
				clearTimeout(timer);
				stalledResponse?.writeHead(status).end();
				await scan;
			}
			const results = await scan;
			const stalled = results.links.filter(
				(result) => result.url === `${origin}/stalled`,
			);
			assert.strictEqual(results.passed, status === 200);
			assert.strictEqual(stalled.length, status === 200 ? 1 : 2);
			assert.strictEqual(emitted.length, results.links.length);
			if (status === 404) {
				assert.deepStrictEqual(
					stalled.map(({ parent, displayText, state }) => ({
						parent,
						displayText,
						state,
					})),
					[
						{
							parent: `${origin}/`,
							displayText: 'original',
							state: LinkState.BROKEN,
						},
						{
							parent: `${origin}/page`,
							displayText: 'duplicate',
							state: LinkState.BROKEN,
						},
					],
				);
			}
		});
	}
});
