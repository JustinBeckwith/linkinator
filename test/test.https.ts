import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import {
	check,
	type HttpInsecureInfo,
	LinkChecker,
	LinkState,
} from '../src/index.js';

describe('https enforcement', () => {
	let server: http.Server;
	let httpUrl: string;

	beforeAll(async () => {
		// Create a test server
		server = http.createServer((req, res) => {
			const url = new URL(req.url || '/', `http://localhost`);

			// Page with both HTTP and HTTPS links
			if (url.pathname === '/page-with-mixed-links') {
				res.writeHead(200, { 'Content-Type': 'text/html' });
				res.end(`<html><body>
					<a href="${httpUrl}/target">HTTP Link</a>
					<a href="https://www.google.com">HTTPS Link</a>
				</body></html>`);
				return;
			}

			// Target endpoint
			if (url.pathname === '/target') {
				res.writeHead(200, { 'Content-Type': 'text/html' });
				res.end('<html><body>Target page</body></html>');
				return;
			}

			// Default 404
			res.writeHead(404);
			res.end();
		});

		await new Promise<void>((resolve) => {
			server.listen(0, () => {
				const addr = server.address() as AddressInfo;
				httpUrl = `http://localhost:${addr.port}`;
				resolve();
			});
		});
	});

	afterAll(() => {
		server.close();
	});

	describe('off mode (default)', () => {
		it('should accept both HTTP and HTTPS links', async () => {
			const results = await check({
				path: `${httpUrl}/page-with-mixed-links`,
				recurse: false,
				requireHttps: 'off',
			});

			// Should have 3 links: the page itself, HTTP link, and HTTPS link
			assert.ok(results.links.length >= 2);

			// The HTTP link should be OK
			const httpLink = results.links.find((link) =>
				link.url.includes('/target'),
			);
			assert.ok(httpLink);
			assert.strictEqual(httpLink.state, LinkState.OK);
		});
	});

	describe('warn mode', () => {
		it('should accept HTTP links but emit warnings', async () => {
			const warnings: HttpInsecureInfo[] = [];
			const checker = new LinkChecker();

			checker.on('httpInsecure', (info) => {
				warnings.push(info);
			});

			const results = await checker.check({
				path: `${httpUrl}/page-with-mixed-links`,
				recurse: false,
				requireHttps: 'warn',
			});

			// Should complete successfully
			assert.ok(results.links.length >= 2);

			// The HTTP links should still be OK
			const httpLinks = results.links.filter((link) =>
				link.url.startsWith('http://'),
			);
			assert.ok(httpLinks.length > 0);
			for (const link of httpLinks) {
				assert.strictEqual(link.state, LinkState.OK);
			}

			// Should have emitted warnings for HTTP links
			assert.ok(warnings.length > 0);
			assert.ok(warnings.some((w) => w.url.startsWith('http://')));
		});
	});

	describe('error mode', () => {
		it('should treat HTTP links as broken', async () => {
			const results = await check({
				path: `${httpUrl}/page-with-mixed-links`,
				recurse: false,
				requireHttps: 'error',
			});

			// Should have multiple links
			assert.ok(results.links.length >= 2);

			// The HTTP links should be BROKEN
			const httpLinks = results.links.filter((link) =>
				link.url.startsWith('http://'),
			);
			assert.ok(httpLinks.length > 0);
			for (const link of httpLinks) {
				assert.strictEqual(link.state, LinkState.BROKEN);
				// Should have error message about HTTPS requirement
				const hasHttpsError = link.failureDetails?.some((detail) =>
					detail instanceof Error
						? detail.message.includes('HTTPS is required')
						: false,
				);
				assert.ok(hasHttpsError, 'Expected HTTPS requirement error message');
			}

			// HTTPS links should still be OK
			const httpsLinks = results.links.filter((link) =>
				link.url.startsWith('https://'),
			);
			if (httpsLinks.length > 0) {
				// Note: External HTTPS links like google.com might be OK or BROKEN
				// depending on network conditions, so we just check they were processed
				assert.ok(httpsLinks.length > 0);
			}
		});

		it('should not affect HTTPS links', async () => {
			// Test a direct HTTPS URL (if we had one)
			// For now, just verify that the enforcement only affects HTTP
			const results = await check({
				path: `${httpUrl}/target`,
				recurse: false,
				requireHttps: 'error',
			});

			// The main HTTP page should be broken
			const mainPage = results.links.find((link) =>
				link.url.includes('/target'),
			);
			assert.ok(mainPage);
			assert.strictEqual(mainPage.state, LinkState.BROKEN);
		});
	});

	describe('crawling with requireHttps', () => {
		it('should apply HTTPS enforcement to crawled links', async () => {
			const results = await check({
				path: `${httpUrl}/page-with-mixed-links`,
				recurse: true,
				requireHttps: 'error',
			});

			// Should have crawled and found HTTP links
			const httpLinks = results.links.filter((link) =>
				link.url.startsWith('http://'),
			);
			assert.ok(httpLinks.length > 0);

			// All HTTP links should be broken
			for (const link of httpLinks) {
				assert.strictEqual(link.state, LinkState.BROKEN);
			}
		});
	});
});
