import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import gaxios from 'gaxios';
import { HttpResponse, http } from 'msw';
import { afterEach, assert, describe, expect, it, vi } from 'vitest';
import {
	type CheckOptions,
	check,
	LinkChecker,
	LinkState,
} from '../src/index.js';
import { DEFAULT_USER_AGENT } from '../src/options.js';
import { ignoreUnhandledRequests, server } from './setup.js';

describe('linkinator', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
	});

	it('should perform a basic shallow scan', async () => {
		let requestCount = 0;
		server.use(
			http.head('http://example.invalid/', () => {
				requestCount++;
				return HttpResponse.json(null, { status: 200 });
			}),
		);
		const results = await check({ path: 'test/fixtures/basic' });
		assert.ok(results.passed);
		assert.strictEqual(requestCount, 1);
	});

	it('should only try a link once', async () => {
		let requestCount = 0;
		server.use(
			http.head('http://example.invalid/', () => {
				requestCount++;
				return HttpResponse.json(null, { status: 200 });
			}),
		);
		const results = await check({ path: 'test/fixtures/twice' });
		assert.ok(results.passed);
		assert.strictEqual(results.links.length, 2);
		assert.strictEqual(requestCount, 1);
	});

	it('should only queue a link once', async () => {
		let requestCount = 0;
		server.use(
			http.head('http://example.invalid/', () => {
				requestCount++;
				return HttpResponse.json(null, { status: 200 });
			}),
		);
		const checker = new LinkChecker();
		const checkerSpy = vi.spyOn(checker, 'crawl');
		const results = await checker.check({ path: 'test/fixtures/twice' });
		assert.ok(results.passed);
		assert.strictEqual(results.links.length, 2);
		assert.strictEqual(checkerSpy.mock.calls.length, 2);
		assert.strictEqual(requestCount, 1);
	});

	it('should skip links if asked nicely', async () => {
		const results = await check({
			path: 'test/fixtures/skip',
			linksToSkip: ['http://very.bad'],
		});
		assert.ok(results.passed);
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.SKIPPED).length,
			1,
		);
	});

	it('should skip links if passed a linksToSkip function', async () => {
		let requestCount = 0;
		server.use(
			http.head('https://good.com/', () => {
				requestCount++;
				return HttpResponse.json(null, { status: 200 });
			}),
		);
		const results = await check({
			path: 'test/fixtures/filter',
			linksToSkip: async (link) => link.includes('filterme'),
		});
		assert.ok(results.passed);
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.SKIPPED).length,
			2,
		);
		assert.strictEqual(requestCount, 1);
	});

	it('should report broken links', async () => {
		let requestCount = 0;
		server.use(
			http.head('http://example.invalid/', () => {
				requestCount++;
				return HttpResponse.json(null, { status: 404 });
			}),
		);
		const results = await check({ path: 'test/fixtures/broke' });
		assert.ok(!results.passed);
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.BROKEN).length,
			1,
		);
		assert.equal(requestCount, 1);
	});

	it('should handle relative links', async () => {
		const results = await check({
			path: 'test/fixtures/relative',
			recurse: true,
		});
		assert.ok(results.passed);
		assert.strictEqual(results.links.length, 4);
	});

	it('should handle fetch exceptions', async () => {
		const requestStub = vi
			.spyOn(gaxios, 'request')
			.mockRejectedValue('Fetch error');
		const results = await check({ path: 'test/fixtures/basic' });
		assert.ok(!results.passed);
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.BROKEN).length,
			1,
		);
		requestStub.mockRestore();
	});

	it('should report malformed links as broken', async () => {
		// This test expects some requests to fail due to malformed URLs, so ignore warnings
		const restore = ignoreUnhandledRequests(['example.invalid']);

		const results = await check({ path: 'test/fixtures/malformed' });
		assert.ok(!results.passed);
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.BROKEN).length,
			1,
		);

		restore();
	});

	it('should detect relative urls with relative base', async () => {
		const cases = [
			{
				fixture: 'test/fixtures/basetag/relative-to-root.html',
				nonBrokenUrl: '/anotherBase/ok',
			},
			{
				fixture: 'test/fixtures/basetag/relative-folder.html',
				nonBrokenUrl: '/pageBase/anotherBase/ok',
			},
			{
				fixture: 'test/fixtures/basetag/relative-dot-folder.html',
				nonBrokenUrl: '/pageBase/anotherBase/ok',
			},
			{
				fixture: 'test/fixtures/basetag/relative-page.html',
				nonBrokenUrl: '/pageBase/ok',
			},
			{
				fixture: 'test/fixtures/basetag/empty-base.html',
				nonBrokenUrl: '/pageBase/ok',
			},
		];

		for (const { fixture, nonBrokenUrl } of cases) {
			let requestCount = 0;
			server.use(
				http.get('http://example.invalid/pageBase/index', async () => {
					requestCount++;
					const content = await fs.readFile(fixture, 'utf-8');
					return HttpResponse.text(content, {
						status: 200,
						headers: {
							'Content-Type': 'text/html; charset=UTF-8',
						},
					});
				}),
				http.head(`http://example.invalid${nonBrokenUrl}`, () => {
					requestCount++;
					return HttpResponse.json(null, { status: 200 });
				}),
			);

			const results = await check({
				path: 'http://example.invalid/pageBase/index',
			});

			assert.strictEqual(results.links.length, 3);
			assert.strictEqual(
				results.links.filter((x) => x.state === LinkState.BROKEN).length,
				1,
			);
			assert.strictEqual(requestCount, 2);
		}
	});

	it('should detect relative urls with absolute base', async () => {
		let requestCount = 0;
		server.use(
			http.get('http://example.invalid/pageBase/index', async () => {
				requestCount++;
				const content = await fs.readFile(
					'test/fixtures/basetag/absolute.html',
					'utf-8',
				);
				return HttpResponse.text(content, {
					status: 200,
					headers: {
						'Content-Type': 'text/html; charset=UTF-8',
					},
				});
			}),
			http.head('http://another.example.invalid/ok', () => {
				requestCount++;
				return HttpResponse.json(null, { status: 200 });
			}),
		);

		const results = await check({
			path: 'http://example.invalid/pageBase/index',
		});

		assert.strictEqual(results.links.length, 3);
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.BROKEN).length,
			1,
		);
		assert.strictEqual(requestCount, 2);
	});

	it('should detect broken image links', async () => {
		// This test expects some requests to fail, so ignore warnings for test domains
		const restore = ignoreUnhandledRequests(['example.invalid']);

		const results = await check({ path: 'test/fixtures/image' });
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.BROKEN).length,
			2,
		);
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.OK).length,
			2,
		);

		restore();
	});

	it('should perform a recursive scan', async () => {
		// This test is making sure that we do a recursive scan of links,
		// but also that we don't follow links to another site
		let requestCount = 0;
		server.use(
			http.head('http://example.invalid/', () => {
				requestCount++;
				return HttpResponse.json(null, { status: 200 });
			}),
		);
		const results = await check({
			path: 'test/fixtures/recurse',
			recurse: true,
		});
		assert.strictEqual(results.links.length, 4);
		assert.strictEqual(requestCount, 1);
	});

	it('should not recurse non-html files', async () => {
		const results = await check({
			path: 'test/fixtures/scripts',
			recurse: true,
		});
		assert.strictEqual(results.links.length, 2);
	});

	it('should not follow non-http[s] links', async () => {
		// Includes mailto, data urls, and irc
		const results = await check({ path: 'test/fixtures/protocols' });
		assert.ok(results.passed);
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.SKIPPED).length,
			3,
		);
	});

	it('should work with picture elements', async () => {
		const results = await check({ path: 'test/fixtures/picture' });
		assert.ok(results.passed);
		assert.strictEqual(results.links.length, 4);
	});

	it('should not recurse by default', async () => {
		const results = await check({ path: 'test/fixtures/recurse' });
		assert.strictEqual(results.links.length, 2);
	});

	it('should retry with a GET after a HEAD', async () => {
		let headCount = 0;
		let getCount = 0;
		server.use(
			http.head('http://example.invalid/', () => {
				headCount++;
				return HttpResponse.json(null, { status: 405 });
			}),
			http.get('http://example.invalid/', () => {
				getCount++;
				return HttpResponse.json(null, { status: 200 });
			}),
		);
		const results = await check({ path: 'test/fixtures/basic' });
		assert.ok(results.passed);
		assert.ok(headCount > 0, 'HEAD mock should have been called');
		assert.ok(getCount > 0, 'GET mock should have been called');
	});

	it('should only follow links on the same origin domain', async () => {
		let requestCount = 0;
		server.use(
			http.get('http://example.invalid/', async () => {
				requestCount++;
				const content = await fs.readFile(
					path.resolve('test/fixtures/baseurl/index.html'),
					'utf-8',
				);
				return HttpResponse.text(content, {
					status: 200,
					headers: {
						'content-type': 'text/html',
					},
				});
			}),
			http.head('http://example.invalid.br/deep.html', () => {
				requestCount++;
				return HttpResponse.json(null, { status: 200 });
			}),
		);
		const results = await check({
			path: 'http://example.invalid',
			recurse: true,
		});
		assert.strictEqual(results.links.length, 2);
		assert.ok(results.passed);
		assert.strictEqual(requestCount, 2);
	});

	it('should not attempt to validate preconnect or prefetch urls', async () => {
		let requestCount = 0;
		server.use(
			http.head('http://example.invalid/site.css', () => {
				requestCount++;
				return HttpResponse.text('', { status: 200 });
			}),
		);
		const results = await check({ path: 'test/fixtures/prefetch' });
		assert.ok(results.passed);
		assert.strictEqual(results.links.length, 2);
		assert.strictEqual(requestCount, 1);
	});

	it('should attempt a GET request if a HEAD request fails on external links', async () => {
		let headCount = 0;
		let getCount = 0;
		server.use(
			http.head('http://example.invalid/', () => {
				headCount++;
				return HttpResponse.json(null, { status: 403 });
			}),
			http.get('http://example.invalid/', () => {
				getCount++;
				return HttpResponse.json(null, { status: 200 });
			}),
		);
		const results = await check({ path: 'test/fixtures/basic' });
		assert.ok(results.passed);
		assert.ok(headCount > 0, 'HEAD mock should have been called');
		assert.ok(getCount > 0, 'GET mock should have been called');
	});

	it('should support a configurable timeout', async () => {
		server.use(
			http.head('http://example.invalid/', async () => {
				await new Promise((resolve) => setTimeout(resolve, 200));
				return HttpResponse.json(null, { status: 200 });
			}),
		);
		const results = await check({
			path: 'test/fixtures/basic',
			timeout: 1,
		});
		assert.ok(!results.passed);
	});

	it('should handle markdown', async () => {
		const results = await check({
			path: 'test/fixtures/markdown/README.md',
			markdown: true,
		});
		assert.strictEqual(results.links.length, 3);
		assert.ok(results.passed);
	});

	it('should throw an error if you pass server-root and an http based path', async () => {
		await expect(() =>
			check({
				path: 'https://jbeckwith.com',
				serverRoot: process.cwd(),
			}),
		).rejects.toThrow(/cannot be defined/);
	});

	it('should allow overriding the server root', async () => {
		const results = await check({
			serverRoot: 'test/fixtures/markdown',
			path: 'README.md',
		});
		assert.strictEqual(results.links.length, 3);
		assert.ok(results.passed);
	});

	it('should allow overriding the server root with a trailing slash', async () => {
		const results = await check({
			serverRoot: 'test/fixtures/markdown/',
			path: 'README.md',
		});
		assert.strictEqual(results.links.length, 3);
		assert.ok(results.passed);
	});

	it('should accept multiple filesystem paths', async () => {
		let requestCount = 0;
		server.use(
			http.head('http://example.invalid/', () => {
				requestCount++;
				return HttpResponse.json(null, { status: 200 });
			}),
		);
		const results = await check({
			path: ['test/fixtures/basic', 'test/fixtures/image'],
		});
		assert.strictEqual(results.passed, false);
		assert.strictEqual(results.links.length, 6);
		assert.strictEqual(requestCount, 1);
	});

	it('should not allow mixed local and remote paths', async () => {
		await expect(
			check({
				path: ['https://jbeckwith.com', 'test/fixtures/basic'],
			}),
		).rejects.toThrow(/cannot be mixed/);
	});

	it('should require at least one path', async () => {
		await expect(
			check({
				path: [],
			}),
		).rejects.toThrow(/At least one/);
	});

	it('should not pollute the original options after merge', async () => {
		const options: CheckOptions = Object.freeze({
			path: 'test/fixtures/basic',
		});
		let requestCount = 0;
		server.use(
			http.head('http://example.invalid/', () => {
				requestCount++;
				return HttpResponse.json(null, { status: 200 });
			}),
		);
		const results = await check(options);
		assert.ok(results.passed);
		assert.strictEqual(requestCount, 1);
		assert.strictEqual(options.serverRoot, undefined);
	});

	it('should accept multiple http paths', async () => {
		let requestCount = 0;
		server.use(
			http.get('http://example.invalid/', async () => {
				requestCount++;
				const content = await fs.readFile(
					'test/fixtures/local/index.html',
					'utf-8',
				);
				return HttpResponse.text(content, {
					status: 200,
					headers: {
						'Content-Type': 'text/html; charset=UTF-8',
					},
				});
			}),
			http.get('http://example.invalid/page2.html', async () => {
				requestCount++;
				const content = await fs.readFile(
					'test/fixtures/local/page2.html',
					'utf-8',
				);
				return HttpResponse.text(content, {
					status: 200,
					headers: {
						'Content-Type': 'text/html; charset=UTF-8',
					},
				});
			}),
			http.get('http://fake2.local/', async () => {
				requestCount++;
				const content = await fs.readFile(
					'test/fixtures/local/index.html',
					'utf-8',
				);
				return HttpResponse.text(content, {
					status: 200,
					headers: {
						'Content-Type': 'text/html; charset=UTF-8',
					},
				});
			}),
			http.get('http://fake2.local/page2.html', async () => {
				requestCount++;
				const content = await fs.readFile(
					'test/fixtures/local/page2.html',
					'utf-8',
				);
				return HttpResponse.text(content, {
					status: 200,
					headers: {
						'Content-Type': 'text/html; charset=UTF-8',
					},
				});
			}),
		);
		const results = await check({
			path: ['http://example.invalid', 'http://fake2.local'],
		});
		assert.ok(results.passed);
		assert.strictEqual(requestCount, 4);
	});

	it('should print debug information when the env var is set', async () => {
		vi.stubEnv('LINKINATOR_DEBUG', 'true');
		const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		const results = await check({
			path: 'test/fixtures/markdown/README.md',
		});
		assert.ok(results.passed);
		assert.strictEqual(consoleSpy.mock.calls.length, 1);
	});

	it('should respect globs', async () => {
		const results = await check({
			path: 'test/fixtures/markdown/**/*.md',
		});
		assert.ok(results.passed);
		assert.strictEqual(results.links.length, 6);
		const licenseLink = results.links.find((x) => x.url.endsWith('LICENSE.md'));
		assert.ok(licenseLink);
		assert.strictEqual(licenseLink.url, 'test/fixtures/markdown/LICENSE.md');
	});

	it('should autoscan markdown if specifically in path', async () => {
		const results = await check({
			path: 'test/fixtures/markdown/README.md',
		});
		assert.ok(results.passed);
		assert.strictEqual(results.links.length, 3);
	});

	it('should throw if a glob provides no paths to scan', async () => {
		await expect(
			check({
				path: 'test/fixtures/basic/*.md',
			}),
		).rejects.toThrow(/returned 0 results/);
	});

	it('should always send a human looking User-Agent', async () => {
		let requestCount = 0;
		server.use(
			http.get('http://example.invalid/', async ({ request }) => {
				requestCount++;
				// Check that User-Agent header is present
				const userAgent = request.headers.get('user-agent');
				assert.strictEqual(userAgent, DEFAULT_USER_AGENT);
				const content = await fs.readFile(
					'test/fixtures/local/index.html',
					'utf-8',
				);
				return HttpResponse.text(content, {
					status: 200,
					headers: {
						'Content-Type': 'text/html; charset=UTF-8',
					},
				});
			}),
			http.get('http://example.invalid/page2.html', async ({ request }) => {
				requestCount++;
				// Check that User-Agent header is present
				const userAgent = request.headers.get('user-agent');
				assert.strictEqual(userAgent, DEFAULT_USER_AGENT);
				const content = await fs.readFile(
					'test/fixtures/local/page2.html',
					'utf-8',
				);
				return HttpResponse.text(content, {
					status: 200,
					headers: {
						'Content-Type': 'text/html; charset=UTF-8',
					},
				});
			}),
		);
		const results = await check({
			path: 'http://example.invalid',
		});
		assert.ok(results.passed);
		assert.strictEqual(requestCount, 2);
	});

	it('should surface call stacks on failures in the API', async () => {
		// This test expects requests to fail, so ignore warnings for test domains
		const restore = ignoreUnhandledRequests(['example.invalid']);

		const results = await check({
			path: 'http://example.invalid',
		});
		assert.ok(!results.passed);
		const failureDetails = results.links[0].failureDetails;
		if (!failureDetails || failureDetails.length === 0) {
			assert.fail('unexpected failure details');
		}
		const error = failureDetails[0] as Error;
		// MSW doesn't block connections like nock, so we expect a different error
		assert.match(error.message, /fetch failed|ENOTFOUND|getaddrinfo/);

		restore();
	});

	it('should respect server root with globs', async () => {
		let requestCount = 0;
		server.use(
			http.get('http://example.invalid/doll1', () => {
				requestCount++;
				return HttpResponse.json(null, { status: 200 });
			}),
			http.get('http://example.invalid/doll2', () => {
				requestCount++;
				return HttpResponse.json(null, { status: 200 });
			}),
		);
		const results = await check({
			serverRoot: 'test/fixtures/nested',
			path: '*/*.html',
		});
		assert.strictEqual(results.links.length, 4);
		assert.ok(results.passed);
		assert.strictEqual(requestCount, 2);
	});

	it('should respect absolute server root', async () => {
		let requestCount = 0;
		server.use(
			http.get('http://example.invalid/doll1', () => {
				requestCount++;
				return HttpResponse.json(null, { status: 200 });
			}),
			http.get('http://example.invalid/doll2', () => {
				requestCount++;
				return HttpResponse.json(null, { status: 200 });
			}),
		);
		const results = await check({
			serverRoot: path.resolve('test/fixtures/nested'),
			path: '*/*.html',
		});
		assert.strictEqual(results.links.length, 4);
		assert.ok(results.passed);
		assert.strictEqual(requestCount, 2);
	});

	it('should scan links in <meta content="URL"> tags', async () => {
		let requestCount = 0;
		server.use(
			http.head('http://example.invalid/', () => {
				requestCount++;
				return HttpResponse.json(null, { status: 200 });
			}),
		);
		const results = await check({ path: 'test/fixtures/twittercard' });
		assert.ok(results.passed);
		assert.strictEqual(requestCount, 1);
		assert.strictEqual(results.links.length, 2);
	});

	it('should support directory index', async () => {
		const results = await check({
			path: 'test/fixtures/directoryIndex/README.md',
			directoryListing: true,
		});
		assert.ok(results.passed);
		assert.strictEqual(results.links.length, 3);
	});

	it('should disabling directory index by default', async () => {
		const results = await check({
			path: 'test/fixtures/directoryIndex/README.md',
		});
		assert.ok(!results.passed);
		assert.strictEqual(results.links.length, 3);
	});

	it('should provide a relative path in the results', async () => {
		let requestCount = 0;
		server.use(
			http.head('http://example.invalid/', () => {
				requestCount++;
				return HttpResponse.json(null, { status: 200 });
			}),
		);
		const results = await check({ path: 'test/fixtures/basic' });
		assert.strictEqual(results.links.length, 2);
		const [rootLink, fakeLink] = results.links;
		assert.strictEqual(rootLink.url, path.join('test', 'fixtures', 'basic'));
		assert.strictEqual(fakeLink.url, 'http://example.invalid/');
		assert.strictEqual(requestCount, 1);
	});

	it('should provide a server root relative path in the results', async () => {
		let requestCount = 0;
		server.use(
			http.head('http://example.invalid/', () => {
				requestCount++;
				return HttpResponse.json(null, { status: 200 });
			}),
		);
		const results = await check({
			path: '.',
			serverRoot: 'test/fixtures/basic',
		});
		assert.strictEqual(results.links.length, 2);
		const [rootLink, fakeLink] = results.links;
		assert.strictEqual(rootLink.url, `.${path.sep}`);
		assert.strictEqual(fakeLink.url, 'http://example.invalid/');
		assert.strictEqual(requestCount, 1);
	});

	it('should rewrite urls', async () => {
		const results = await check({
			path: 'test/fixtures/rewrite/README.md',
			urlRewriteExpressions: [
				{
					pattern: /NOTLICENSE\.[a-z]+/,
					replacement: 'LICENSE.md',
				},
			],
		});
		assert.ok(results.passed);
	});

	it('should handle comma separated srcset', async () => {
		const results = await check({ path: 'test/fixtures/srcset' });
		assert.ok(results.passed);
	});

	it('should handle encoded urls', async () => {
		const results = await check({
			serverRoot: 'test/fixtures/urlpatterns',
			path: 'index.html',
		});
		assert.ok(results.passed);
	});

	it('should accept a custom user agent', async () => {
		const userAgent = 'linkinator-test';
		let requestCount = 0;
		server.use(
			http.head('http://example.invalid/', ({ request }) => {
				requestCount++;
				// Check that custom User-Agent header is present
				const headerUserAgent = request.headers.get('user-agent');
				assert.strictEqual(headerUserAgent, userAgent);
				return HttpResponse.json(null, { status: 200 });
			}),
		);
		const results = await check({ path: 'test/fixtures/basic', userAgent });
		assert.ok(results.passed);
		assert.strictEqual(requestCount, 1);
	});
});
