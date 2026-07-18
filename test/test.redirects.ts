import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import {
	check,
	LinkChecker,
	LinkState,
	type RedirectInfo,
} from '../src/index.js';

describe('redirects', () => {
	let server: http.Server;
	let rootUrl: string;

	beforeAll(async () => {
		// Create a test server that handles redirects properly
		server = http.createServer((req, res) => {
			const url = new URL(req.url || '/', `http://localhost`);

			// Endpoint that returns 307 Temporary Redirect
			if (url.pathname === '/redirect-307') {
				res.writeHead(307, {
					Location: `${rootUrl}/target`,
					'Content-Type': 'text/html',
				});
				res.end('Redirecting...');
				return;
			}

			// Endpoint that returns 308 Permanent Redirect
			if (url.pathname === '/redirect-308') {
				res.writeHead(308, {
					Location: `${rootUrl}/target`,
					'Content-Type': 'text/html',
				});
				res.end('Redirecting...');
				return;
			}

			// Endpoint that returns 301 Moved Permanently (classic redirect)
			if (url.pathname === '/redirect-301') {
				res.writeHead(301, {
					Location: `${rootUrl}/target`,
					'Content-Type': 'text/html',
				});
				res.end('Redirecting...');
				return;
			}

			// Endpoint that returns 302 Found (classic redirect)
			if (url.pathname === '/redirect-302') {
				res.writeHead(302, {
					Location: `${rootUrl}/target`,
					'Content-Type': 'text/html',
				});
				res.end('Redirecting...');
				return;
			}

			// Target endpoint that redirects point to
			if (url.pathname === '/target') {
				res.writeHead(200, { 'Content-Type': 'text/html' });
				res.end('<html><body>Success</body></html>');
				return;
			}

			// Page with links to redirect endpoints
			if (url.pathname === '/page-with-redirects') {
				res.writeHead(200, { 'Content-Type': 'text/html' });
				res.end(`<html><body>
					<a href="${rootUrl}/redirect-307">307 Link</a>
					<a href="${rootUrl}/redirect-308">308 Link</a>
					<a href="${rootUrl}/redirect-301">301 Link</a>
					<a href="${rootUrl}/redirect-302">302 Link</a>
				</body></html>`);
				return;
			}

			// Default 404
			res.writeHead(404);
			res.end('Not Found');
		});

		await new Promise<void>((resolve, reject) => {
			server.listen(0, () => {
				const addr = server.address() as AddressInfo;
				rootUrl = `http://localhost:${addr.port}`;
				resolve();
			});
			server.on('error', reject);
		});
	});

	afterAll(() => {
		server.close();
	});

	it('should follow 307 redirects and mark as OK', async () => {
		const results = await check({ path: `${rootUrl}/redirect-307` });
		assert.ok(results.passed, 'Check should pass for 307 redirect');
		assert.strictEqual(results.links.length, 1);
		const link = results.links[0];
		assert.strictEqual(
			link.state,
			LinkState.OK,
			'307 redirect should be marked as OK',
		);
		assert.strictEqual(
			link.status,
			200,
			'Should return final status after redirect',
		);
	});

	it('should follow 308 redirects and mark as OK', async () => {
		const results = await check({ path: `${rootUrl}/redirect-308` });
		assert.ok(results.passed, 'Check should pass for 308 redirect');
		assert.strictEqual(results.links.length, 1);
		const link = results.links[0];
		assert.strictEqual(
			link.state,
			LinkState.OK,
			'308 redirect should be marked as OK',
		);
		assert.strictEqual(
			link.status,
			200,
			'Should return final status after redirect',
		);
	});

	it('should follow 301 redirects and mark as OK', async () => {
		const results = await check({ path: `${rootUrl}/redirect-301` });
		assert.ok(results.passed, 'Check should pass for 301 redirect');
		assert.strictEqual(results.links.length, 1);
		const link = results.links[0];
		assert.strictEqual(
			link.state,
			LinkState.OK,
			'301 redirect should be marked as OK',
		);
		assert.strictEqual(
			link.status,
			200,
			'Should return final status after redirect',
		);
	});

	it('should follow 302 redirects and mark as OK', async () => {
		const results = await check({ path: `${rootUrl}/redirect-302` });
		assert.ok(results.passed, 'Check should pass for 302 redirect');
		assert.strictEqual(results.links.length, 1);
		const link = results.links[0];
		assert.strictEqual(
			link.state,
			LinkState.OK,
			'302 redirect should be marked as OK',
		);
		assert.strictEqual(
			link.status,
			200,
			'Should return final status after redirect',
		);
	});

	it('should follow redirects when checking links in crawled pages', async () => {
		const results = await check({ path: `${rootUrl}/page-with-redirects` });
		assert.ok(results.passed, 'All redirect links should pass');
		// 1 for the page itself + 4 redirect links
		assert.strictEqual(results.links.length, 5);
		const redirectLinks = results.links.filter((link) =>
			link.url.includes('redirect-'),
		);
		assert.strictEqual(redirectLinks.length, 4);
		// All redirect links should be marked as OK
		for (const link of redirectLinks) {
			assert.strictEqual(
				link.state,
				LinkState.OK,
				`Link ${link.url} should be OK`,
			);
			assert.strictEqual(
				link.status,
				200,
				`Link ${link.url} should have status 200 after following redirect`,
			);
		}
	});

	describe('redirect modes', () => {
		it('should follow redirects in allow mode (default)', async () => {
			const results = await check({
				path: `${rootUrl}/redirect-308`,
				redirects: 'allow',
			});
			assert.ok(results.passed);
			assert.strictEqual(results.links[0].state, LinkState.OK);
			assert.strictEqual(results.links[0].status, 200);
		});

		it('should emit warnings in warn mode', async () => {
			const checker = new LinkChecker();
			const redirectWarnings: RedirectInfo[] = [];

			checker.on('redirect', (info: RedirectInfo) => {
				redirectWarnings.push(info);
			});

			const results = await checker.check({
				path: `${rootUrl}/redirect-307`,
				redirects: 'warn',
			});

			assert.ok(results.passed, 'Should pass in warn mode');
			assert.strictEqual(results.links[0].state, LinkState.OK);
			assert.strictEqual(results.links[0].status, 200);
			assert.strictEqual(
				redirectWarnings.length,
				1,
				'Should emit one redirect warning',
			);
			// When fetch follows redirects, we see the final status (200)
			// but we know a redirect happened because URL changed
			assert.strictEqual(redirectWarnings[0].status, 200);
			assert.strictEqual(redirectWarnings[0].isNonStandard, false);
		});

		it('should mark redirects as broken in error mode', async () => {
			const results = await check({
				path: `${rootUrl}/redirect-301`,
				redirects: 'error',
			});

			assert.ok(!results.passed, 'Should not pass in error mode');
			assert.strictEqual(results.links[0].state, LinkState.BROKEN);
			assert.strictEqual(results.links[0].status, 301);
			assert.ok(
				results.links[0].failureDetails &&
					results.links[0].failureDetails.length > 0,
				'Should have failure details',
			);
		});

		it('should handle non-standard redirects in allow mode', async () => {
			// Create a non-standard redirect (308 without Location header but with content)
			const nonStandardServer = http.createServer((req, res) => {
				if (req.url === '/non-standard') {
					res.writeHead(308, { 'Content-Type': 'text/html' });
					res.end('<html><body>Content despite 308</body></html>');
					return;
				}
				res.writeHead(404);
				res.end();
			});

			await new Promise<void>((resolve) => {
				nonStandardServer.listen(0, () => resolve());
			});

			const addr = nonStandardServer.address() as AddressInfo;
			const nsUrl = `http://localhost:${addr.port}/non-standard`;

			try {
				const results = await check({ path: nsUrl, redirects: 'allow' });
				// In allow mode, non-standard redirects with content should be OK
				assert.strictEqual(results.links[0].state, LinkState.OK);
			} finally {
				nonStandardServer.close();
			}
		});

		it('should warn about non-standard redirects in warn mode', async () => {
			const nonStandardServer = http.createServer((req, res) => {
				if (req.url === '/non-standard') {
					res.writeHead(308, { 'Content-Type': 'text/html' });
					res.end('<html><body>Content despite 308</body></html>');
					return;
				}
				res.writeHead(404);
				res.end();
			});

			await new Promise<void>((resolve) => {
				nonStandardServer.listen(0, () => resolve());
			});

			const addr = nonStandardServer.address() as AddressInfo;
			const nsUrl = `http://localhost:${addr.port}/non-standard`;

			try {
				const checker = new LinkChecker();
				const redirectWarnings: RedirectInfo[] = [];

				checker.on('redirect', (info: RedirectInfo) => {
					redirectWarnings.push(info);
				});

				const results = await checker.check({
					path: nsUrl,
					redirects: 'warn',
				});

				assert.ok(results.passed);
				assert.strictEqual(redirectWarnings.length, 1);
				assert.strictEqual(
					redirectWarnings[0].isNonStandard,
					true,
					'Should detect non-standard redirect',
				);
			} finally {
				nonStandardServer.close();
			}
		});

		it('should reject non-standard redirects in error mode', async () => {
			const nonStandardServer = http.createServer((req, res) => {
				if (req.url === '/non-standard') {
					res.writeHead(308, { 'Content-Type': 'text/html' });
					res.end('<html><body>Content despite 308</body></html>');
					return;
				}
				res.writeHead(404);
				res.end();
			});

			await new Promise<void>((resolve) => {
				nonStandardServer.listen(0, () => resolve());
			});

			const addr = nonStandardServer.address() as AddressInfo;
			const nsUrl = `http://localhost:${addr.port}/non-standard`;

			try {
				const results = await check({ path: nsUrl, redirects: 'error' });
				assert.ok(!results.passed);
				assert.strictEqual(results.links[0].state, LinkState.BROKEN);
				assert.strictEqual(results.links[0].status, 308);
			} finally {
				nonStandardServer.close();
			}
		});

		it('should handle redirects with no target URL in error mode', async () => {
			const noTargetServer = http.createServer((req, res) => {
				if (req.url === '/no-target') {
					// 302 with no Location header
					res.writeHead(302, { 'Content-Type': 'text/html' });
					res.end('Redirect with no target');
					return;
				}
				res.writeHead(404);
				res.end();
			});

			await new Promise<void>((resolve) => {
				noTargetServer.listen(0, () => resolve());
			});

			const addr = noTargetServer.address() as AddressInfo;
			const ntUrl = `http://localhost:${addr.port}/no-target`;

			try {
				const results = await check({ path: ntUrl, redirects: 'error' });
				assert.ok(!results.passed);
				assert.strictEqual(results.links[0].state, LinkState.BROKEN);
				// Should have error message about redirect being disabled
				assert.ok(
					results.links[0].failureDetails &&
						results.links[0].failureDetails.length > 0,
				);
			} finally {
				noTargetServer.close();
			}
		});

		it('should emit warnings even for redirects that resolve successfully', async () => {
			// Test that warn mode emits warnings for all redirects, not just broken ones
			const checker = new LinkChecker();
			const redirectWarnings: RedirectInfo[] = [];

			checker.on('redirect', (info: RedirectInfo) => {
				redirectWarnings.push(info);
			});

			const results = await checker.check({
				path: `${rootUrl}/redirect-301`,
				redirects: 'warn',
			});

			// Should pass because redirect target exists
			assert.ok(results.passed);
			assert.strictEqual(results.links[0].state, LinkState.OK);
			// Should emit redirect warning
			assert.strictEqual(redirectWarnings.length, 1);
			assert.ok(redirectWarnings[0].targetUrl?.includes('/target'));
		});
	});

	describe('skip rules', () => {
		it('does not request a skipped redirect target', async () => {
			let targetRequests = 0;
			const targetServer = http.createServer((_req, res) => {
				targetRequests++;
				res.end('unexpected');
			});
			await new Promise<void>((resolve) => targetServer.listen(0, resolve));
			const targetAddress = targetServer.address() as AddressInfo;
			const targetUrl = `http://localhost:${targetAddress.port}/external`;

			const redirectServer = http.createServer((_req, res) => {
				res.writeHead(302, { Location: targetUrl });
				res.end();
			});
			await new Promise<void>((resolve) => redirectServer.listen(0, resolve));
			const redirectAddress = redirectServer.address() as AddressInfo;
			const redirectUrl = `http://localhost:${redirectAddress.port}/redirect`;

			try {
				const results = await check({
					path: redirectUrl,
					linksToSkip: [`^${targetUrl}`],
				});
				assert.ok(results.passed);
				assert.strictEqual(results.links[0].state, LinkState.SKIPPED);
				assert.strictEqual(results.links[0].url, redirectUrl);
				assert.strictEqual(targetRequests, 0);
			} finally {
				redirectServer.close();
				targetServer.close();
			}
		});

		it('checks every target in a redirect chain with function rules', async () => {
			let skippedTargetRequests = 0;
			const chainServer = http.createServer((req, res) => {
				if (req.url === '/start') {
					res.writeHead(302, { Location: '/middle' });
					res.end();
					return;
				}
				if (req.url === '/middle') {
					res.writeHead(307, { Location: '/skipped' });
					res.end();
					return;
				}
				skippedTargetRequests++;
				res.end('unexpected');
			});
			await new Promise<void>((resolve) => chainServer.listen(0, resolve));
			const address = chainServer.address() as AddressInfo;
			const chainUrl = `http://localhost:${address.port}`;

			try {
				const results = await check({
					path: `${chainUrl}/start`,
					linksToSkip: async (url) => url === `${chainUrl}/skipped`,
				});
				assert.strictEqual(results.links[0].state, LinkState.SKIPPED);
				assert.strictEqual(skippedTargetRequests, 0);
			} finally {
				chainServer.close();
			}
		});

		it('does not forward sensitive headers across origins', async () => {
			let receivedAuthorization: string | undefined;
			let receivedCookie: string | undefined;
			let receivedCustomHeader: string | undefined;
			const targetServer = http.createServer((req, res) => {
				receivedAuthorization = req.headers.authorization;
				receivedCookie = req.headers.cookie;
				receivedCustomHeader = req.headers['x-linkinator-test'] as string;
				res.writeHead(200, { 'Content-Type': 'text/html' });
				res.end('ok');
			});
			await new Promise<void>((resolve) => targetServer.listen(0, resolve));
			const targetAddress = targetServer.address() as AddressInfo;
			const targetUrl = `http://localhost:${targetAddress.port}/target`;

			const redirectServer = http.createServer((_req, res) => {
				res.writeHead(302, { Location: targetUrl });
				res.end();
			});
			await new Promise<void>((resolve) => redirectServer.listen(0, resolve));
			const redirectAddress = redirectServer.address() as AddressInfo;
			const redirectUrl = `http://localhost:${redirectAddress.port}/redirect`;

			try {
				const results = await check({
					path: redirectUrl,
					linksToSkip: ['never-match'],
					headers: {
						Authorization: 'Bearer secret',
						Cookie: 'session=secret',
						'X-Linkinator-Test': 'preserved',
					},
				});
				assert.ok(results.passed);
				assert.strictEqual(results.links[0].url, redirectUrl);
				assert.strictEqual(receivedAuthorization, undefined);
				assert.strictEqual(receivedCookie, undefined);
				assert.strictEqual(receivedCustomHeader, 'preserved');
			} finally {
				redirectServer.close();
				targetServer.close();
			}
		});

		it('preserves sensitive headers for same-origin redirects', async () => {
			let receivedAuthorization: string | undefined;
			const sameOriginServer = http.createServer((req, res) => {
				if (req.url === '/redirect') {
					res.writeHead(302, { Location: '/target' });
					res.end();
					return;
				}
				receivedAuthorization = req.headers.authorization;
				res.writeHead(200, { 'Content-Type': 'text/html' });
				res.end('ok');
			});
			await new Promise<void>((resolve) => sameOriginServer.listen(0, resolve));
			const address = sameOriginServer.address() as AddressInfo;
			const redirectUrl = `http://localhost:${address.port}/redirect`;

			try {
				const results = await check({
					path: redirectUrl,
					linksToSkip: ['never-match'],
					headers: { Authorization: 'Bearer same-origin' },
				});
				assert.ok(results.passed);
				assert.strictEqual(receivedAuthorization, 'Bearer same-origin');
			} finally {
				sameOriginServer.close();
			}
		});

		it('does not follow non-redirect 3xx statuses with Location headers', async () => {
			let targetRequests = 0;
			const statusServer = http.createServer((req, res) => {
				if (req.url === '/not-modified') {
					res.writeHead(304, { Location: '/target' });
					res.end();
					return;
				}
				targetRequests++;
				res.end('unexpected');
			});
			await new Promise<void>((resolve) => statusServer.listen(0, resolve));
			const address = statusServer.address() as AddressInfo;

			try {
				const results = await check({
					path: `http://localhost:${address.port}/not-modified`,
					linksToSkip: ['never-match'],
				});
				assert.ok(!results.passed);
				assert.strictEqual(results.links[0].status, 304);
				assert.strictEqual(targetRequests, 0);
			} finally {
				statusServer.close();
			}
		});

		it('keeps redirects in error mode broken without applying target skips', async () => {
			let targetRequests = 0;
			const errorModeServer = http.createServer((req, res) => {
				if (req.url === '/redirect') {
					res.writeHead(302, { Location: '/target' });
					res.end();
					return;
				}
				targetRequests++;
				res.end('unexpected');
			});
			await new Promise<void>((resolve) => errorModeServer.listen(0, resolve));
			const address = errorModeServer.address() as AddressInfo;
			const serverUrl = `http://localhost:${address.port}`;

			try {
				const results = await check({
					path: `${serverUrl}/redirect`,
					linksToSkip: [`${serverUrl}/target`],
					redirects: 'error',
				});
				assert.ok(!results.passed);
				assert.strictEqual(results.links[0].state, LinkState.BROKEN);
				assert.strictEqual(results.links[0].status, 302);
				assert.strictEqual(targetRequests, 0);
			} finally {
				errorModeServer.close();
			}
		});

		it('fails redirect chains that exceed the fetch redirect limit', async () => {
			let requests = 0;
			const loopServer = http.createServer((req, res) => {
				requests++;
				const current = Number(
					new URL(req.url || '/', 'http://localhost').searchParams.get('n'),
				);
				res.writeHead(302, { Location: `/loop?n=${current + 1}` });
				res.end();
			});
			await new Promise<void>((resolve) => loopServer.listen(0, resolve));
			const address = loopServer.address() as AddressInfo;
			const loopUrl = `http://localhost:${address.port}/loop?n=0`;

			try {
				const results = await check({
					path: loopUrl,
					linksToSkip: ['never-match'],
				});
				assert.ok(!results.passed);
				assert.strictEqual(results.links[0].state, LinkState.BROKEN);
				// One initial request plus the maximum 20 followed redirects.
				assert.strictEqual(requests, 21);
			} finally {
				loopServer.close();
			}
		});

		it('allows exactly the fetch limit of 20 redirects', async () => {
			let requests = 0;
			const limitServer = http.createServer((req, res) => {
				requests++;
				const current = Number(
					new URL(req.url || '/', 'http://localhost').searchParams.get('n'),
				);
				if (current < 20) {
					res.writeHead(302, { Location: `/chain?n=${current + 1}` });
					res.end();
					return;
				}
				res.writeHead(200, { 'Content-Type': 'text/html' });
				res.end('ok');
			});
			await new Promise<void>((resolve) => limitServer.listen(0, resolve));
			const address = limitServer.address() as AddressInfo;
			const limitUrl = `http://localhost:${address.port}/chain?n=0`;

			try {
				const results = await check({
					path: limitUrl,
					linksToSkip: ['never-match'],
				});
				assert.ok(results.passed);
				assert.strictEqual(results.links[0].status, 200);
				assert.strictEqual(requests, 21);
			} finally {
				limitServer.close();
			}
		});

		it('reports a failed redirect target as broken', async () => {
			const redirectServer = http.createServer((_req, res) => {
				res.writeHead(302, { Location: 'http://localhost:1/unreachable' });
				res.end();
			});
			await new Promise<void>((resolve) => redirectServer.listen(0, resolve));
			const address = redirectServer.address() as AddressInfo;
			const redirectUrl = `http://localhost:${address.port}/redirect`;

			try {
				const results = await check({
					path: redirectUrl,
					linksToSkip: ['never-match'],
				});
				assert.ok(!results.passed);
				assert.strictEqual(results.links[0].state, LinkState.BROKEN);
				assert.strictEqual(results.links[0].url, redirectUrl);
			} finally {
				redirectServer.close();
			}
		});

		it('applies retry handling to the final redirect response', async () => {
			let targetRequests = 0;
			const targetServer = http.createServer((_req, res) => {
				targetRequests++;
				if (targetRequests === 1) {
					res.writeHead(429, { 'Retry-After': '0' });
					res.end();
					return;
				}
				res.writeHead(200, { 'Content-Type': 'text/html' });
				res.end('ok');
			});
			await new Promise<void>((resolve) => targetServer.listen(0, resolve));
			const targetAddress = targetServer.address() as AddressInfo;
			const targetUrl = `http://localhost:${targetAddress.port}/target`;

			const redirectServer = http.createServer((_req, res) => {
				res.writeHead(302, { Location: targetUrl });
				res.end();
			});
			await new Promise<void>((resolve) => redirectServer.listen(0, resolve));
			const redirectAddress = redirectServer.address() as AddressInfo;
			const redirectUrl = `http://localhost:${redirectAddress.port}/redirect`;

			try {
				const results = await check({
					path: redirectUrl,
					linksToSkip: ['never-match'],
					retry: true,
				});
				assert.ok(results.passed);
				assert.strictEqual(results.links[0].status, 200);
				assert.strictEqual(targetRequests, 2);
			} finally {
				redirectServer.close();
				targetServer.close();
			}
		});
	});
});
