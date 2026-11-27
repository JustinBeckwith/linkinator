import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, assert, describe, it } from 'vitest';
import { check, LinkState } from '../src/index.js';

describe('response body timeouts', () => {
	let server: http.Server | undefined;

	afterEach(async () => {
		if (server) {
			server.closeAllConnections();
			await new Promise<void>((resolve, reject) => {
				server?.close((error) => (error ? reject(error) : resolve()));
			});
			server = undefined;
		}
	});

	async function startStallingServer() {
		server = http.createServer((request, response) => {
			response.writeHead(200, { 'content-type': 'text/html' });
			if (request.url === '/') {
				response.end('<a href="/slow">slow</a>');
				return;
			}
			// Send headers and part of the body, then stall.
			response.write('<html><body>');
		});
		await new Promise<void>((resolve, reject) => {
			server?.once('error', reject).listen(0, '127.0.0.1', resolve);
		});
		const { port } = server.address() as AddressInfo;
		return `http://127.0.0.1:${port}/`;
	}

	for (const checkFragments of [false, true]) {
		it(`reports a page whose body times out as broken (checkFragments: ${checkFragments})`, async () => {
			const base = await startStallingServer();
			const results = await check({
				path: base,
				recurse: true,
				timeout: 200,
				checkFragments,
			});

			assert.strictEqual(results.passed, false);
			const slow = results.links.find((link) => link.url === `${base}slow`);
			assert.ok(slow);
			assert.strictEqual(slow.state, LinkState.BROKEN);
			assert.strictEqual(slow.status, 200);
			assert.ok(slow.failureDetails?.some((detail) => detail instanceof Error));
		});
	}
});
