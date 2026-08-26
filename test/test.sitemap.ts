import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { Readable } from 'node:stream';
import { gzipSync } from 'node:zlib';
import { afterEach, assert, describe, expect, it } from 'vitest';
import { check, LinkChecker, LinkState } from '../src/index.js';
import { parseSitemap } from '../src/sitemap.js';

describe('sitemap parsing', () => {
	it('parses namespaced URL sets and decodes entities', async () => {
		const sitemap = await parseSitemap(
			Readable.from(`<?xml version="1.0"?>
				<sm:urlset xmlns:sm="http://www.sitemaps.org/schemas/sitemap/0.9">
					<sm:url><sm:loc>https://example.com/a?x=1&amp;y=2</sm:loc></sm:url>
					<sm:url><sm:loc>https://example.com/b</sm:loc></sm:url>
				</sm:urlset>`),
		);

		assert.deepStrictEqual(sitemap, {
			type: 'urlset',
			locations: ['https://example.com/a?x=1&y=2', 'https://example.com/b'],
		});
	});

	it('rejects XML that is not a sitemap', async () => {
		await expect(
			parseSitemap(Readable.from('<feed><link>nope</link></feed>')),
		).rejects.toThrow(/Expected a sitemap/);
	});

	it('rejects an empty document', async () => {
		await expect(parseSitemap(Readable.from(''))).rejects.toThrow(
			/root element/,
		);
	});

	it('ignores blank and extension location elements', async () => {
		const sitemap = await parseSitemap(
			Readable.from(`<urlset>
				<loc>https://example.com/not-a-url-entry</loc>
				<url><loc>  </loc></url>
				<url xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
					<loc>https://example.com/page</loc>
					<image:image><image:loc>https://example.com/image.jpg</image:loc></image:image>
				</url>
			</urlset>`),
		);

		assert.deepStrictEqual(sitemap.locations, ['https://example.com/page']);
	});

	it('rejects malformed or truncated XML', async () => {
		await expect(
			parseSitemap(
				Readable.from('<urlset><url><loc>https://example.com</url></urlset>'),
			),
		).rejects.toThrow();
		await expect(
			parseSitemap(Readable.from('<urlset><url><loc>https://example.com')),
		).rejects.toThrow();
		await expect(
			parseSitemap(Readable.from('<urlset><url value=unquoted/></urlset>')),
		).rejects.toThrow();
		await expect(
			parseSitemap(
				Readable.from('<urlset><url value="a" value="b"/></urlset>'),
			),
		).rejects.toThrow();
		await expect(
			parseSitemap(Readable.from('<urlset></urlset><urlset></urlset>')),
		).rejects.toThrow();
		await expect(
			parseSitemap(
				Readable.from(
					'<urlset><url><loc>https://example.com/&bogus;</loc></url></urlset>',
				),
			),
		).rejects.toThrow();
		await expect(
			parseSitemap(Readable.from('garbage<urlset/>')),
		).rejects.toThrow();
		await expect(
			parseSitemap(Readable.from('<urlset/>garbage')),
		).rejects.toThrow();

		let sourceClosed = false;
		const malformedStream = Readable.from(
			(async function* () {
				try {
					yield '<urlset></wrong-root>';
					yield '<never-reached/>';
				} finally {
					sourceClosed = true;
				}
			})(),
		);
		await expect(parseSitemap(malformedStream)).rejects.toThrow();
		assert.ok(sourceClosed);
	});

	it('rejects entries that do not match the sitemap root type', async () => {
		await expect(
			parseSitemap(
				Readable.from(
					'<urlset><sitemap><loc>https://example.com/child.xml</loc></sitemap></urlset>',
				),
			),
		).rejects.toThrow(/Invalid <sitemap> entry inside <urlset>/);
		await expect(
			parseSitemap(
				Readable.from(
					'<sitemapindex><url><loc>https://example.com/page</loc></url></sitemapindex>',
				),
			),
		).rejects.toThrow(/Invalid <url> entry inside <sitemapindex>/);
		await expect(
			parseSitemap(Readable.from('<urlset><sitemap/></urlset>')),
		).rejects.toThrow(/Invalid <sitemap> entry inside <urlset>/);
		await expect(
			parseSitemap(Readable.from('<sitemapindex><url/></sitemapindex>')),
		).rejects.toThrow(/Invalid <url> entry inside <sitemapindex>/);
		await expect(
			parseSitemap(
				Readable.from(
					'<urlset><wrapper><url><loc>https://example.com</loc></url></wrapper></urlset>',
				),
			),
		).rejects.toThrow(/Invalid <url> entry inside <urlset>/);
	});

	it('rejects source stream errors', async () => {
		const source = new Readable({
			read() {
				this.destroy(new Error('socket reset'));
			},
		});

		await expect(parseSitemap(source)).rejects.toThrow(/socket reset/);

		const partialSource = Readable.from(
			(async function* () {
				yield '<urlset>';
				throw new Error('stream interrupted');
			})(),
		);
		await expect(parseSitemap(partialSource)).rejects.toThrow(
			/stream interrupted/,
		);

		const compressedSource = Readable.from(
			(async function* () {
				yield Buffer.from([0x1f, 0x8b]);
				throw new Error('compressed stream interrupted');
			})(),
		);
		await expect(parseSitemap(compressedSource)).rejects.toThrow(
			/compressed stream interrupted|unexpected end/i,
		);
	});

	it('streams gzip-compressed sitemaps', async () => {
		const sitemap = await parseSitemap(
			Readable.from(
				gzipSync(
					'<urlset><url><loc>https://example.com/compressed</loc></url></urlset>',
				),
			),
		);

		assert.deepStrictEqual(sitemap.locations, [
			'https://example.com/compressed',
		]);
	});

	it('parses the protocol maximum of 50,000 page entries', async () => {
		const pageCount = 50_000;
		const source = Readable.from(
			`<urlset>${Array.from(
				{ length: pageCount },
				(_, index) => `<url><loc>https://example.com/page-${index}</loc></url>`,
			).join('')}</urlset>`,
		);

		const sitemap = await parseSitemap(source);

		assert.strictEqual(sitemap.locations.length, pageCount);
		assert.strictEqual(sitemap.locations[0], 'https://example.com/page-0');
		assert.strictEqual(
			sitemap.locations.at(-1),
			'https://example.com/page-49999',
		);
	});
});

describe('sitemap crawling', () => {
	let server: http.Server | undefined;

	afterEach(async () => {
		if (server) {
			await new Promise<void>((resolve, reject) => {
				server?.close((error) => (error ? reject(error) : resolve()));
			});
			server = undefined;
		}
	});

	it('crawls pages from nested sitemap indexes without recursive discovery', async () => {
		const requestedPaths: string[] = [];
		let rootUrl = '';
		server = http.createServer((request, response) => {
			const requestUrl = request.url || '/';
			requestedPaths.push(requestUrl);
			response.setHeader('content-type', 'text/html');

			switch (requestUrl) {
				case '/sitemap.xml': {
					response.setHeader('content-type', 'application/xml');
					response.end(`<sitemapindex>
						<sitemap><loc>${rootUrl}/sitemap.xml?page=1</loc></sitemap>
						<sitemap><loc>${rootUrl}/sitemap.xml?page=2</loc></sitemap>
					</sitemapindex>`);
					break;
				}
				case '/sitemap.xml?page=1': {
					response.setHeader('content-type', 'application/xml');
					response.end(`<urlset>
						<url><loc>${rootUrl}/page-a</loc></url>
						<url><loc>${rootUrl}/page-b</loc></url>
					</urlset>`);
					break;
				}
				case '/sitemap.xml?page=2': {
					response.setHeader('content-type', 'application/xml');
					response.end(`<urlset>
						<url><loc>${rootUrl}/page-b</loc></url>
						<url><loc>${rootUrl}/page-c</loc></url>
					</urlset>`);
					break;
				}
				case '/page-a': {
					response.end('<a href="/shared">shared</a>');
					break;
				}
				case '/page-b': {
					response.end('<a href="/broken">broken</a>');
					break;
				}
				case '/page-c': {
					response.end('<a href="/not-in-sitemap">do not recurse</a>');
					break;
				}
				case '/shared': {
					response.end('ok');
					break;
				}
				case '/not-in-sitemap': {
					response.end('<a href="/deep">deep</a>');
					break;
				}
				default: {
					response.writeHead(404).end('missing');
				}
			}
		});
		await new Promise<void>((resolve, reject) => {
			server?.once('error', reject).listen(0, '127.0.0.1', resolve);
		});
		const { port } = server.address() as AddressInfo;
		rootUrl = `http://127.0.0.1:${port}`;

		const checker = new LinkChecker();
		const pagesStarted: string[] = [];
		checker.on('pagestart', (url) => pagesStarted.push(url.toString()));
		const results = await checker.check({ path: rootUrl, sitemap: true });

		assert.strictEqual(results.passed, false);
		assert.deepStrictEqual(
			pagesStarted.sort(),
			[`${rootUrl}/page-a`, `${rootUrl}/page-b`, `${rootUrl}/page-c`].sort(),
		);
		assert.strictEqual(
			results.links.filter((result) => result.url === `${rootUrl}/page-b`)
				.length,
			1,
		);
		assert.ok(
			results.links.some(
				(result) =>
					result.url === `${rootUrl}/broken` &&
					result.state === LinkState.BROKEN,
			),
		);
		assert.ok(requestedPaths.includes('/not-in-sitemap'));
		assert.ok(!requestedPaths.includes('/'));
		assert.ok(!requestedPaths.includes('/deep'));
	});

	it('accepts an explicit sitemap URL', async () => {
		let rootUrl = '';
		server = http.createServer((request, response) => {
			if (request.url === '/custom-map.xml') {
				response.setHeader('content-type', 'application/xml');
				response.end(
					`<urlset><url><loc>${rootUrl}/from-map</loc></url></urlset>`,
				);
				return;
			}
			response.setHeader('content-type', 'text/html');
			response.end('ok');
		});
		await new Promise<void>((resolve, reject) => {
			server?.once('error', reject).listen(0, '127.0.0.1', resolve);
		});
		const { port } = server.address() as AddressInfo;
		rootUrl = `http://127.0.0.1:${port}`;

		const results = await check({
			path: rootUrl,
			sitemap: `${rootUrl}/custom-map.xml`,
		});

		assert.deepStrictEqual(
			results.links.map((result) => result.url),
			[`${rootUrl}/from-map`],
		);
	});

	it('deduplicates explicit sitemap arrays and cyclic indexes', async () => {
		const requestedPaths: string[] = [];
		let rootUrl = '';
		server = http.createServer((request, response) => {
			requestedPaths.push(request.url || '/');
			response.setHeader('content-type', 'application/xml');
			if (request.url === '/index.xml') {
				response.end(`<sitemapindex>
					<sitemap><loc>${rootUrl}/index.xml</loc></sitemap>
					<sitemap><loc>${rootUrl}/pages.xml</loc></sitemap>
				</sitemapindex>`);
				return;
			}
			if (request.url === '/pages.xml') {
				response.end(`<urlset><url><loc>${rootUrl}/page</loc></url></urlset>`);
				return;
			}
			response.setHeader('content-type', 'text/html');
			response.end('ok');
		});
		await new Promise<void>((resolve, reject) => {
			server?.once('error', reject).listen(0, '127.0.0.1', resolve);
		});
		const { port } = server.address() as AddressInfo;
		rootUrl = `http://127.0.0.1:${port}`;

		const results = await check({
			path: rootUrl,
			sitemap: [`${rootUrl}/index.xml`, `${rootUrl}/index.xml`],
		});

		assert.ok(results.passed);
		assert.strictEqual(
			requestedPaths.filter((path) => path === '/index.xml').length,
			1,
		);
		assert.deepStrictEqual(
			results.links.map((result) => result.url),
			[`${rootUrl}/page`],
		);
	});

	it('loads gzip-compressed sitemap indexes and children', async () => {
		let rootUrl = '';
		server = http.createServer((request, response) => {
			if (request.url === '/index.xml.gz') {
				response.setHeader('content-type', 'application/gzip');
				response.end(
					gzipSync(`<sitemapindex>
						<sitemap><loc>${rootUrl}/pages.xml.gz</loc></sitemap>
					</sitemapindex>`),
				);
				return;
			}
			if (request.url === '/pages.xml.gz') {
				response.setHeader('content-type', 'application/gzip');
				response.end(
					gzipSync(
						`<urlset><url><loc>${rootUrl}/compressed-page</loc></url></urlset>`,
					),
				);
				return;
			}
			response.setHeader('content-type', 'text/html');
			response.end('ok');
		});
		await new Promise<void>((resolve, reject) => {
			server?.once('error', reject).listen(0, '127.0.0.1', resolve);
		});
		const { port } = server.address() as AddressInfo;
		rootUrl = `http://127.0.0.1:${port}`;

		const results = await check({
			path: rootUrl,
			sitemap: `${rootUrl}/index.xml.gz`,
		});

		assert.ok(results.passed);
		assert.strictEqual(results.links[0].url, `${rootUrl}/compressed-page`);
	});

	it('loads child sitemaps with bounded concurrency', async () => {
		let activeSitemapRequests = 0;
		let maxActiveSitemapRequests = 0;
		let rootUrl = '';
		const childSitemapPaths = Array.from(
			{ length: 8 },
			(_, index) => `/map-${index}.xml`,
		);
		const sendChildSitemap = async (
			response: http.ServerResponse,
			pageIndex: number,
		) => {
			activeSitemapRequests++;
			maxActiveSitemapRequests = Math.max(
				maxActiveSitemapRequests,
				activeSitemapRequests,
			);
			await new Promise((resolve) => setTimeout(resolve, 20));
			activeSitemapRequests--;
			response.setHeader('content-type', 'application/xml');
			response.end(
				`<urlset><url><loc>${rootUrl}/page-${pageIndex}</loc></url></urlset>`,
			);
		};
		server = http.createServer(async (request, response) => {
			if (request.url === '/sitemap.xml') {
				response.setHeader('content-type', 'application/xml');
				response.end(
					`<sitemapindex>${childSitemapPaths
						.map((path) => `<sitemap><loc>${rootUrl}${path}</loc></sitemap>`)
						.join('')}</sitemapindex>`,
				);
				return;
			}
			switch (request.url) {
				case '/map-0.xml':
					return sendChildSitemap(response, 0);
				case '/map-1.xml':
					return sendChildSitemap(response, 1);
				case '/map-2.xml':
					return sendChildSitemap(response, 2);
				case '/map-3.xml':
					return sendChildSitemap(response, 3);
				case '/map-4.xml':
					return sendChildSitemap(response, 4);
				case '/map-5.xml':
					return sendChildSitemap(response, 5);
				case '/map-6.xml':
					return sendChildSitemap(response, 6);
				case '/map-7.xml':
					return sendChildSitemap(response, 7);
			}
			response.setHeader('content-type', 'text/html');
			response.end('ok');
		});
		await new Promise<void>((resolve, reject) => {
			server?.once('error', reject).listen(0, '127.0.0.1', resolve);
		});
		const { port } = server.address() as AddressInfo;
		rootUrl = `http://127.0.0.1:${port}`;

		const results = await check({
			path: rootUrl,
			sitemap: true,
			concurrency: 3,
		});

		assert.ok(results.passed);
		assert.strictEqual(results.links.length, 8);
		assert.strictEqual(maxActiveSitemapRequests, 3);
	});

	it('starts page checks while sibling sitemaps are still loading', async () => {
		let rootUrl = '';
		let slowSitemapFinished = false;
		let pageStartedBeforeSlowSitemapFinished = false;
		let activeRequests = 0;
		let maxActiveRequests = 0;
		server = http.createServer((request, response) => {
			activeRequests++;
			maxActiveRequests = Math.max(maxActiveRequests, activeRequests);
			response.once('finish', () => activeRequests--);
			if (request.url === '/sitemap.xml') {
				response.setHeader('content-type', 'application/xml');
				response.end(`<sitemapindex>
					<sitemap><loc>${rootUrl}/fast.xml</loc></sitemap>
					<sitemap><loc>${rootUrl}/slow.xml</loc></sitemap>
				</sitemapindex>`);
				return;
			}
			if (request.url === '/fast.xml') {
				response.setHeader('content-type', 'application/xml');
				response.end(`<urlset>
					<url><loc>${rootUrl}/fast-page-a</loc></url>
					<url><loc>${rootUrl}/fast-page-b</loc></url>
				</urlset>`);
				return;
			}
			if (request.url === '/slow.xml') {
				setTimeout(() => {
					slowSitemapFinished = true;
					response.setHeader('content-type', 'application/xml');
					response.end(
						`<urlset><url><loc>${rootUrl}/slow-page</loc></url></urlset>`,
					);
				}, 500);
				return;
			}
			if (request.url?.startsWith('/fast-page')) {
				pageStartedBeforeSlowSitemapFinished = !slowSitemapFinished;
				setTimeout(() => response.end('ok'), 50);
				return;
			}
			response.end('ok');
		});
		await new Promise<void>((resolve, reject) => {
			server?.once('error', reject).listen(0, '127.0.0.1', resolve);
		});
		const { port } = server.address() as AddressInfo;
		rootUrl = `http://127.0.0.1:${port}`;

		const results = await check({
			path: rootUrl,
			sitemap: true,
			concurrency: 2,
		});

		assert.ok(results.passed);
		assert.ok(pageStartedBeforeSlowSitemapFinished);
		assert.ok(maxActiveRequests <= 2);
	});

	it('cancels sibling sitemap requests after the first failure', async () => {
		let rootUrl = '';
		let failedResponse: http.ServerResponse | undefined;
		let resolveSlowRequestClosed: () => void;
		const slowRequestClosed = new Promise<void>((resolve) => {
			resolveSlowRequestClosed = resolve;
		});
		let slowRequestFinished = false;
		server = http.createServer((request, response) => {
			if (request.url === '/sitemap.xml') {
				response.setHeader('content-type', 'application/xml');
				response.end(`<sitemapindex>
					<sitemap><loc>${rootUrl}/failed.xml</loc></sitemap>
					<sitemap><loc>${rootUrl}/slow.xml</loc></sitemap>
				</sitemapindex>`);
				return;
			}
			if (request.url === '/failed.xml') {
				failedResponse = response;
				return;
			}
			if (request.url === '/slow.xml') {
				const timer = setTimeout(() => {
					slowRequestFinished = true;
					response.end('<urlset/>');
				}, 1000);
				response.once('close', () => {
					clearTimeout(timer);
					resolveSlowRequestClosed();
				});
				failedResponse?.writeHead(500).end('failed');
				return;
			}
			response.writeHead(404).end('missing');
		});
		await new Promise<void>((resolve, reject) => {
			server?.once('error', reject).listen(0, '127.0.0.1', resolve);
		});
		const { port } = server.address() as AddressInfo;
		rootUrl = `http://127.0.0.1:${port}`;

		await expect(
			check({ path: rootUrl, sitemap: true, concurrency: 2 }),
		).rejects.toThrow(/HTTP 500/);
		await Promise.race([
			slowRequestClosed,
			new Promise((_, reject) =>
				setTimeout(
					() => reject(new Error('The sibling sitemap request was not closed')),
					250,
				),
			),
		]);
		assert.strictEqual(slowRequestFinished, false);
	});

	it('cancels page checks when later sitemap discovery fails', async () => {
		let rootUrl = '';
		let failedResponse: http.ServerResponse | undefined;
		let resolvePageClosed: () => void;
		const pageClosed = new Promise<void>((resolve) => {
			resolvePageClosed = resolve;
		});
		server = http.createServer((request, response) => {
			if (request.url === '/sitemap.xml') {
				response.setHeader('content-type', 'application/xml');
				response.end(`<sitemapindex>
					<sitemap><loc>${rootUrl}/fast.xml</loc></sitemap>
					<sitemap><loc>${rootUrl}/failed.xml</loc></sitemap>
				</sitemapindex>`);
				return;
			}
			if (request.url === '/fast.xml') {
				response.end(`<urlset><url><loc>${rootUrl}/hang</loc></url></urlset>`);
				return;
			}
			if (request.url === '/failed.xml') {
				failedResponse = response;
				return;
			}
			if (request.url === '/hang') {
				response.once('close', resolvePageClosed);
				failedResponse?.writeHead(500).end('failed');
				return;
			}
			response.end('ok');
		});
		await new Promise<void>((resolve, reject) => {
			server?.once('error', reject).listen(0, '127.0.0.1', resolve);
		});
		const { port } = server.address() as AddressInfo;
		rootUrl = `http://127.0.0.1:${port}`;

		await expect(
			check({ path: rootUrl, sitemap: true, concurrency: 2 }),
		).rejects.toThrow(/HTTP 500/);
		await Promise.race([
			pageClosed,
			new Promise((_, reject) =>
				setTimeout(
					() => reject(new Error('The page request was not closed')),
					250,
				),
			),
		]);
	});

	it('deduplicates rewritten seeds before recursively crawling them', async () => {
		const requestedPaths: string[] = [];
		let rootUrl = '';
		server = http.createServer((request, response) => {
			requestedPaths.push(request.url || '/');
			response.setHeader('content-type', 'text/html');
			if (request.url === '/sitemap.xml') {
				response.setHeader('content-type', 'application/xml');
				response.end(`<urlset>
					<url><loc>${rootUrl}/page-a</loc></url>
					<url><loc>${rootUrl}/page-b</loc></url>
				</urlset>`);
				return;
			}
			if (request.url === '/page') {
				response.end('<a href="/unlisted">unlisted</a>');
				return;
			}
			if (request.url === '/unlisted') {
				response.end('<a href="/deep">deep</a>');
				return;
			}
			response.end('ok');
		});
		await new Promise<void>((resolve, reject) => {
			server?.once('error', reject).listen(0, '127.0.0.1', resolve);
		});
		const { port } = server.address() as AddressInfo;
		rootUrl = `http://127.0.0.1:${port}`;

		const results = await check({
			path: rootUrl,
			sitemap: true,
			recurse: true,
			urlRewriteExpressions: [{ pattern: /-[ab]$/, replacement: '' }],
		});

		assert.ok(results.passed);
		assert.strictEqual(
			requestedPaths.filter((requestPath) => requestPath === '/page').length,
			1,
		);
		assert.ok(requestedPaths.includes('/unlisted'));
		assert.ok(requestedPaths.includes('/deep'));
	});

	it('honors retry policies for sitemap requests', async () => {
		let rootUrl = '';
		let rateLimitAttempts = 0;
		let serverErrorAttempts = 0;
		let networkErrorAttempts = 0;
		let streamErrorAttempts = 0;
		let invalidXmlAttempts = 0;
		server = http.createServer((request, response) => {
			if (request.url === '/rate-limited.xml' && rateLimitAttempts++ === 0) {
				response.writeHead(429, { 'Retry-After': '0' }).end('retry');
				return;
			}
			if (request.url === '/server-error.xml' && serverErrorAttempts++ === 0) {
				response.writeHead(500).end('retry');
				return;
			}
			if (
				request.url === '/network-error.xml' &&
				networkErrorAttempts++ === 0
			) {
				request.socket.destroy();
				return;
			}
			if (request.url === '/stream-error.xml' && streamErrorAttempts++ === 0) {
				response.writeHead(200, { 'Content-Type': 'application/xml' });
				response.write('<urlset>');
				response.socket?.destroy();
				return;
			}
			if (request.url === '/invalid.xml') {
				invalidXmlAttempts++;
				response.end('<urlset><url></urlset>');
				return;
			}
			if (
				request.url === '/rate-limited.xml' ||
				request.url === '/server-error.xml' ||
				request.url === '/network-error.xml' ||
				request.url === '/stream-error.xml'
			) {
				response.setHeader('content-type', 'application/xml');
				response.end(`<urlset><url><loc>${rootUrl}/page</loc></url></urlset>`);
				return;
			}
			response.end('ok');
		});
		await new Promise<void>((resolve, reject) => {
			server?.once('error', reject).listen(0, '127.0.0.1', resolve);
		});
		const { port } = server.address() as AddressInfo;
		rootUrl = `http://127.0.0.1:${port}`;

		const retryAfterChecker = new LinkChecker();
		const retryAfterEvents: Array<{ status: number }> = [];
		retryAfterChecker.on('retry', (event) => retryAfterEvents.push(event));
		const rateLimitResult = await retryAfterChecker.check({
			path: rootUrl,
			sitemap: `${rootUrl}/rate-limited.xml`,
			retry: true,
		});
		assert.ok(rateLimitResult.passed);
		assert.strictEqual(rateLimitAttempts, 2);
		expect(retryAfterEvents).toEqual([
			expect.objectContaining({ status: 429 }),
		]);

		const errorChecker = new LinkChecker();
		const errorRetryEvents: Array<{ status: number }> = [];
		errorChecker.on('retry', (event) => errorRetryEvents.push(event));
		const serverErrorResult = await errorChecker.check({
			path: rootUrl,
			sitemap: `${rootUrl}/server-error.xml`,
			retryErrors: true,
			retryErrorsCount: 1,
			retryErrorsJitter: 0,
		});
		assert.ok(serverErrorResult.passed);
		assert.strictEqual(serverErrorAttempts, 2);
		expect(errorRetryEvents).toEqual([
			expect.objectContaining({ status: 500 }),
		]);

		const networkChecker = new LinkChecker();
		const networkRetryEvents: Array<{ status: number }> = [];
		networkChecker.on('retry', (event) => networkRetryEvents.push(event));
		const networkErrorResult = await networkChecker.check({
			path: rootUrl,
			sitemap: `${rootUrl}/network-error.xml`,
			retryErrors: true,
			retryErrorsCount: 1,
			retryErrorsJitter: 0,
		});
		assert.ok(networkErrorResult.passed);
		assert.strictEqual(networkErrorAttempts, 2);
		expect(networkRetryEvents).toEqual([
			expect.objectContaining({ status: 0 }),
		]);

		const streamChecker = new LinkChecker();
		const streamRetryEvents: Array<{ status: number }> = [];
		streamChecker.on('retry', (event) => streamRetryEvents.push(event));
		const streamErrorResult = await streamChecker.check({
			path: rootUrl,
			sitemap: `${rootUrl}/stream-error.xml`,
			retryErrors: true,
			retryErrorsCount: 1,
			retryErrorsJitter: 0,
		});
		assert.ok(streamErrorResult.passed);
		assert.strictEqual(streamErrorAttempts, 2);
		expect(streamRetryEvents).toEqual([expect.objectContaining({ status: 0 })]);

		await expect(
			check({
				path: rootUrl,
				sitemap: `${rootUrl}/invalid.xml`,
				retryErrors: true,
				retryErrorsCount: 1,
				retryErrorsJitter: 0,
			}),
		).rejects.toThrow(/Unable to parse sitemap/);
		assert.strictEqual(invalidXmlAttempts, 1);
	});

	it('releases the global request slot during sitemap retry backoff', async () => {
		let rootUrl = '';
		let rateLimitAttempts = 0;
		let pageStartedDuringBackoff = false;
		server = http.createServer((request, response) => {
			if (request.url === '/fast.xml') {
				response.end(
					`<urlset><url><loc>${rootUrl}/fast-page</loc></url></urlset>`,
				);
				return;
			}
			if (request.url === '/rate-limited.xml') {
				rateLimitAttempts++;
				if (rateLimitAttempts === 1) {
					response.writeHead(429, { 'Retry-After': '0.2' }).end('retry');
					return;
				}
				response.end(
					`<urlset><url><loc>${rootUrl}/rate-page</loc></url></urlset>`,
				);
				return;
			}
			if (request.url === '/fast-page') {
				pageStartedDuringBackoff = rateLimitAttempts === 1;
			}
			response.end('ok');
		});
		await new Promise<void>((resolve, reject) => {
			server?.once('error', reject).listen(0, '127.0.0.1', resolve);
		});
		const { port } = server.address() as AddressInfo;
		rootUrl = `http://127.0.0.1:${port}`;

		const results = await check({
			path: rootUrl,
			sitemap: [`${rootUrl}/fast.xml`, `${rootUrl}/rate-limited.xml`],
			concurrency: 1,
			retry: true,
		});

		assert.ok(results.passed);
		assert.strictEqual(rateLimitAttempts, 2);
		assert.ok(pageStartedDuringBackoff);
	});

	it('does not reacquire a request slot after an aborted sitemap retry', async () => {
		let rootUrl = '';
		let fastResponse: http.ServerResponse | undefined;
		let invalidResponse: http.ServerResponse | undefined;
		let retryStarted = false;
		let hangingPageStarted = false;

		const finishFastResponse = () => {
			if (!retryStarted || !fastResponse) return;
			fastResponse.end(`<urlset>
				<url><loc>${rootUrl}/hanging-1</loc></url>
				<url><loc>${rootUrl}/hanging-2</loc></url>
			</urlset>`);
			fastResponse = undefined;
		};
		const finishInvalidResponse = () => {
			if (!hangingPageStarted || !invalidResponse) return;
			invalidResponse.end(
				'<urlset><url><loc>mailto:test@example.com</loc></url></urlset>',
			);
			invalidResponse = undefined;
		};

		server = http.createServer((request, response) => {
			switch (request.url) {
				case '/fast.xml': {
					fastResponse = response;
					finishFastResponse();
					break;
				}
				case '/retry.xml': {
					retryStarted = true;
					response.writeHead(429, { 'Retry-After': '60' }).end('retry');
					finishFastResponse();
					break;
				}
				case '/invalid.xml': {
					invalidResponse = response;
					finishInvalidResponse();
					break;
				}
				case '/hanging-1':
				case '/hanging-2': {
					hangingPageStarted = true;
					finishInvalidResponse();
					break;
				}
				default: {
					response.end('ok');
				}
			}
		});
		await new Promise<void>((resolve, reject) => {
			server?.once('error', reject).listen(0, '127.0.0.1', resolve);
		});
		const { port } = server.address() as AddressInfo;
		rootUrl = `http://127.0.0.1:${port}`;
		const checker = new LinkChecker();
		let retryEvents = 0;
		checker.on('retry', () => retryEvents++);

		let timeout: NodeJS.Timeout | undefined;
		try {
			await expect(
				Promise.race([
					checker.check({
						path: rootUrl,
						sitemap: [
							`${rootUrl}/fast.xml`,
							`${rootUrl}/retry.xml`,
							`${rootUrl}/invalid.xml`,
						],
						concurrency: 2,
						retry: true,
					}),
					new Promise<never>((_, reject) => {
						timeout = setTimeout(
							() => reject(new Error('sitemap cancellation timed out')),
							1000,
						);
					}),
				]),
			).rejects.toThrow(/Invalid URL protocol in sitemap/);
		} finally {
			if (timeout) clearTimeout(timeout);
		}
		assert.strictEqual(retryEvents, 1);
		assert.ok(hangingPageStarted);
	});

	it('applies headers and URL rewrites to sitemap redirects and pages', async () => {
		const requestedPaths: string[] = [];
		let rootUrl = '';
		server = http.createServer((request, response) => {
			assert.strictEqual(request.headers['x-sitemap-test'], 'present');
			requestedPaths.push(request.url || '/');
			if (request.url === '/sitemap.xml') {
				response.writeHead(302, {
					Location: 'https://production.example/actual.xml',
				});
				response.end();
				return;
			}
			if (request.url === '/actual.xml') {
				response.setHeader('content-type', 'application/xml');
				response.end(`<urlset>
					<url><loc>https://production.example/page</loc></url>
				</urlset>`);
				return;
			}
			response.setHeader('content-type', 'text/html');
			response.end('ok');
		});
		await new Promise<void>((resolve, reject) => {
			server?.once('error', reject).listen(0, '127.0.0.1', resolve);
		});
		const { port } = server.address() as AddressInfo;
		rootUrl = `http://127.0.0.1:${port}`;

		const results = await check({
			path: 'https://production.example',
			sitemap: true,
			headers: { 'X-Sitemap-Test': 'present' },
			urlRewriteExpressions: [
				{
					pattern: /^https:\/\/production\.example/,
					replacement: rootUrl,
				},
			],
		});

		assert.ok(results.passed);
		assert.deepStrictEqual(requestedPaths, [
			'/sitemap.xml',
			'/actual.xml',
			'/page',
		]);
		assert.strictEqual(results.links[0].url, `${rootUrl}/page`);
	});

	it('rejects redirects to skipped sitemap URLs', async () => {
		let rootUrl = '';
		server = http.createServer((request, response) => {
			if (request.url === '/sitemap.xml') {
				response.writeHead(302, { Location: `${rootUrl}/blocked.xml` });
				response.end();
				return;
			}
			response.end('<urlset/>');
		});
		await new Promise<void>((resolve, reject) => {
			server?.once('error', reject).listen(0, '127.0.0.1', resolve);
		});
		const { port } = server.address() as AddressInfo;
		rootUrl = `http://127.0.0.1:${port}`;

		await expect(
			check({ path: rootUrl, sitemap: true, linksToSkip: ['blocked'] }),
		).rejects.toThrow(/excluded by a skip rule/);
	});

	it('honors redirect warning and error policies for sitemap requests', async () => {
		const requestedPaths: string[] = [];
		let rootUrl = '';
		server = http.createServer((request, response) => {
			requestedPaths.push(request.url || '/');
			if (request.url === '/sitemap.xml') {
				response.writeHead(302, { Location: `${rootUrl}/actual.xml` });
				response.end();
				return;
			}
			if (request.url === '/actual.xml') {
				response.setHeader('content-type', 'application/xml');
				response.end(`<urlset><url><loc>${rootUrl}/page</loc></url></urlset>`);
				return;
			}
			response.setHeader('content-type', 'text/html');
			response.end('ok');
		});
		await new Promise<void>((resolve, reject) => {
			server?.once('error', reject).listen(0, '127.0.0.1', resolve);
		});
		const { port } = server.address() as AddressInfo;
		rootUrl = `http://127.0.0.1:${port}`;

		const checker = new LinkChecker();
		const redirects: Array<{ url: string; targetUrl?: string }> = [];
		checker.on('redirect', (redirect) => redirects.push(redirect));
		const results = await checker.check({
			path: rootUrl,
			sitemap: true,
			redirects: 'warn',
		});

		assert.ok(results.passed);
		expect(redirects).toEqual([
			expect.objectContaining({
				url: `${rootUrl}/sitemap.xml`,
				targetUrl: `${rootUrl}/actual.xml`,
			}),
		]);
		const actualRequests = requestedPaths.filter(
			(path) => path === '/actual.xml',
		).length;
		await expect(
			check({ path: rootUrl, sitemap: true, redirects: 'error' }),
		).rejects.toThrow(/HTTP 302/);
		assert.strictEqual(
			requestedPaths.filter((path) => path === '/actual.xml').length,
			actualRequests,
		);
	});

	it('combines sitemap seeds with opt-in recursive crawling', async () => {
		const requestedPaths: string[] = [];
		let rootUrl = '';
		server = http.createServer((request, response) => {
			requestedPaths.push(request.url || '/');
			response.setHeader('content-type', 'text/html');
			if (request.url === '/sitemap.xml') {
				response.setHeader('content-type', 'application/xml');
				response.end(`<urlset><url><loc>${rootUrl}/page</loc></url></urlset>`);
				return;
			}
			if (request.url === '/page') {
				response.end('<a href="/unlisted">unlisted</a>');
				return;
			}
			if (request.url === '/unlisted') {
				response.end('<a href="/deep">deep</a>');
				return;
			}
			response.end('ok');
		});
		await new Promise<void>((resolve, reject) => {
			server?.once('error', reject).listen(0, '127.0.0.1', resolve);
		});
		const { port } = server.address() as AddressInfo;
		rootUrl = `http://127.0.0.1:${port}`;

		const results = await check({
			path: rootUrl,
			sitemap: true,
			recurse: true,
		});

		assert.ok(results.passed);
		assert.ok(requestedPaths.includes('/unlisted'));
		assert.ok(requestedPaths.includes('/deep'));
	});

	it('reports invalid and unusable sitemaps clearly', async () => {
		let rootUrl = '';
		server = http.createServer((request, response) => {
			response.setHeader('content-type', 'application/xml');
			switch (request.url) {
				case '/missing.xml': {
					response.writeHead(404).end('missing');
					break;
				}
				case '/empty-response.xml': {
					response.writeHead(204).end();
					break;
				}
				case '/not-a-sitemap.xml': {
					response.end('<feed/>');
					break;
				}
				case '/invalid-location.xml': {
					response.end('<urlset><url><loc>http://[</loc></url></urlset>');
					break;
				}
				case '/invalid-protocol.xml': {
					response.end(
						'<urlset><url><loc>mailto:test@example.com</loc></url></urlset>',
					);
					break;
				}
				default: {
					response.end('<urlset/>');
				}
			}
		});
		await new Promise<void>((resolve, reject) => {
			server?.once('error', reject).listen(0, '127.0.0.1', resolve);
		});
		const { port } = server.address() as AddressInfo;
		rootUrl = `http://127.0.0.1:${port}`;

		await expect(
			check({ path: rootUrl, sitemap: 'not a URL' }),
		).rejects.toThrow(/Invalid sitemap URL/);
		await expect(
			check({ path: rootUrl, sitemap: 'ftp://example.com/sitemap.xml' }),
		).rejects.toThrow(/Invalid sitemap URL protocol/);
		await expect(
			check({ path: rootUrl, sitemap: `${rootUrl}/missing.xml` }),
		).rejects.toThrow(/HTTP 404/);
		await expect(
			check({ path: rootUrl, sitemap: `${rootUrl}/empty-response.xml` }),
		).rejects.toThrow(/empty response/);
		await expect(
			check({ path: rootUrl, sitemap: `${rootUrl}/not-a-sitemap.xml` }),
		).rejects.toThrow(/Unable to parse sitemap/);
		await expect(
			check({ path: rootUrl, sitemap: `${rootUrl}/invalid-location.xml` }),
		).rejects.toThrow(/Invalid URL in sitemap/);
		await expect(
			check({ path: rootUrl, sitemap: `${rootUrl}/invalid-protocol.xml` }),
		).rejects.toThrow(/Invalid URL protocol in sitemap/);
		await expect(
			check({ path: rootUrl, sitemap: `${rootUrl}/empty.xml` }),
		).rejects.toThrow(/did not contain any page URLs/);
	});

	it('rejects sitemap mode for local filesystem paths', async () => {
		await expect(
			check({ path: 'test/fixtures/basic', sitemap: true }),
		).rejects.toThrow(/can only be used with HTTP paths/);
	});
});
