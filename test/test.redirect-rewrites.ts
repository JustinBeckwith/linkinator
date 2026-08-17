import http, { type RequestListener } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, assert, describe, it } from 'vitest';
import {
	check,
	LinkChecker,
	LinkState,
	type RedirectInfo,
} from '../src/index.js';

describe('redirect URL rewrites', () => {
	const servers: http.Server[] = [];

	async function serve(handler: RequestListener): Promise<string> {
		const server = http.createServer(handler);
		servers.push(server);
		await new Promise<void>((resolve, reject) => {
			server.listen(0, resolve);
			server.on('error', reject);
		});
		const address = server.address() as AddressInfo;
		return `http://localhost:${address.port}`;
	}

	afterEach(async () => {
		await Promise.all(
			servers.splice(0).map(
				(server) =>
					new Promise<void>((resolve, reject) => {
						server.close((error) => (error ? reject(error) : resolve()));
					}),
			),
		);
	});

	it('rewrites a redirect target before requesting it', async () => {
		let legacyTargetRequests = 0;
		const legacyUrl = await serve((_request, response) => {
			legacyTargetRequests++;
			response.writeHead(500);
			response.end('legacy target should not be requested');
		});

		let rewrittenTargetRequests = 0;
		const rewrittenUrl = await serve((_request, response) => {
			rewrittenTargetRequests++;
			response.writeHead(403, { 'cf-mitigated': 'challenge' });
			response.end('challenge');
		});

		const redirectUrl = await serve((_request, response) => {
			response.writeHead(302, { Location: `${legacyUrl}/citation/paper` });
			response.end();
		});

		const startUrl = `${redirectUrl}/doi/paper`;
		const results = await check({
			path: startUrl,
			urlRewriteExpressions: [
				{
					pattern: new RegExp(`^${legacyUrl}/citation/`),
					replacement: `${rewrittenUrl}/doi/`,
				},
			],
		});

		assert.ok(results.passed);
		assert.strictEqual(results.links[0].url, startUrl);
		assert.strictEqual(results.links[0].status, 403);
		assert.strictEqual(results.links[0].state, LinkState.SKIPPED);
		assert.strictEqual(legacyTargetRequests, 0);
		assert.strictEqual(rewrittenTargetRequests, 1);
	});

	it('applies rewrites to every target in a redirect chain', async () => {
		const requestedPaths: string[] = [];
		const serverUrl = await serve((request, response) => {
			requestedPaths.push(request.url || '');
			if (request.url === '/start') {
				response.writeHead(302, { Location: '/legacy-middle' });
				response.end();
				return;
			}
			if (request.url === '/middle') {
				response.writeHead(307, { Location: '/legacy-final' });
				response.end();
				return;
			}
			response.writeHead(request.url === '/final' ? 200 : 500);
			response.end(request.url === '/final' ? 'ok' : 'unrewritten target');
		});

		const results = await check({
			path: `${serverUrl}/start`,
			urlRewriteExpressions: [{ pattern: /\/legacy-/, replacement: '/' }],
		});

		assert.ok(results.passed);
		assert.strictEqual(results.links[0].status, 200);
		assert.deepStrictEqual(requestedPaths, ['/start', '/middle', '/final']);
	});

	it('applies multiple rewrite expressions in sequence', async () => {
		const requestedPaths: string[] = [];
		const serverUrl = await serve((request, response) => {
			requestedPaths.push(request.url || '');
			if (request.url === '/start') {
				response.writeHead(302, { Location: '/legacy-target' });
				response.end();
				return;
			}
			response.writeHead(request.url === '/final-target' ? 200 : 500);
			response.end();
		});

		const results = await check({
			path: `${serverUrl}/start`,
			urlRewriteExpressions: [
				{ pattern: /\/legacy-target$/, replacement: '/intermediate' },
				{ pattern: /\/intermediate$/, replacement: '/final-target' },
			],
		});

		assert.ok(results.passed);
		assert.deepStrictEqual(requestedPaths, ['/start', '/final-target']);
	});

	it('checks skip rules after rewriting the redirect target', async () => {
		const requestedPaths: string[] = [];
		const serverUrl = await serve((request, response) => {
			requestedPaths.push(request.url || '');
			response.writeHead(302, { Location: '/legacy-target' });
			response.end();
		});

		const results = await check({
			path: `${serverUrl}/start`,
			urlRewriteExpressions: [
				{ pattern: /\/legacy-target$/, replacement: '/rewritten-target' },
			],
			linksToSkip: [`${serverUrl}/rewritten-target`],
		});

		assert.ok(results.passed);
		assert.strictEqual(results.links[0].state, LinkState.SKIPPED);
		assert.deepStrictEqual(requestedPaths, ['/start']);
	});

	it('skips a redirect target rewritten to a non-HTTP URL', async () => {
		const requestedPaths: string[] = [];
		const serverUrl = await serve((request, response) => {
			requestedPaths.push(request.url || '');
			response.writeHead(302, { Location: '/legacy-target' });
			response.end();
		});

		const results = await check({
			path: `${serverUrl}/start`,
			urlRewriteExpressions: [
				{
					pattern: /^https?:\/\/.*\/legacy-target$/,
					replacement: 'mailto:test@example.com',
				},
			],
		});

		assert.ok(results.passed);
		assert.strictEqual(results.links[0].state, LinkState.SKIPPED);
		assert.deepStrictEqual(requestedPaths, ['/start']);
	});

	it('strips sensitive headers when a rewrite changes the target origin', async () => {
		let receivedHeaders: http.IncomingHttpHeaders = {};
		const targetUrl = await serve((request, response) => {
			receivedHeaders = request.headers;
			response.writeHead(200);
			response.end('ok');
		});
		const redirectUrl = await serve((_request, response) => {
			response.writeHead(302, { Location: '/legacy-target' });
			response.end();
		});

		const results = await check({
			path: `${redirectUrl}/start`,
			urlRewriteExpressions: [
				{
					pattern: new RegExp(`^${redirectUrl}/legacy-target$`),
					replacement: `${targetUrl}/target`,
				},
			],
			headers: {
				Authorization: 'Bearer secret',
				Cookie: 'session=secret',
				'Proxy-Authorization': 'Basic secret',
				'X-Linkinator-Test': 'preserved',
			},
		});

		assert.ok(results.passed);
		assert.strictEqual(receivedHeaders.authorization, undefined);
		assert.strictEqual(receivedHeaders.cookie, undefined);
		assert.strictEqual(receivedHeaders['proxy-authorization'], undefined);
		assert.strictEqual(receivedHeaders['x-linkinator-test'], 'preserved');
	});

	it('reports the rewritten final URL in redirect warnings', async () => {
		const serverUrl = await serve((request, response) => {
			if (request.url === '/start') {
				response.writeHead(302, { Location: '/legacy-target' });
				response.end();
				return;
			}
			response.writeHead(200);
			response.end('ok');
		});
		const checker = new LinkChecker();
		const warnings: RedirectInfo[] = [];
		checker.on('redirect', (info) => warnings.push(info));

		const results = await checker.check({
			path: `${serverUrl}/start`,
			redirects: 'warn',
			urlRewriteExpressions: [
				{ pattern: /\/legacy-target$/, replacement: '/rewritten-target' },
			],
		});

		assert.ok(results.passed);
		assert.deepStrictEqual(warnings, [
			{
				url: `${serverUrl}/start`,
				targetUrl: `${serverUrl}/rewritten-target`,
				status: 200,
				isNonStandard: false,
			},
		]);
	});
});
