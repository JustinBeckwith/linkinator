import path from 'node:path';
import process from 'node:process';
import nock from 'nock';
import { assert, afterEach, describe, expect, it, vi } from 'vitest';
import {
	type CheckOptions,
	LinkChecker,
	LinkState,
	check,
} from '../src/index.js';
import { DEFAULT_USER_AGENT } from '../src/options.js';

nock.disableNetConnect();
nock.enableNetConnect('localhost');

describe('linkinator', () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		nock.cleanAll();
	});

	it('should perform a basic shallow scan', async () => {
		const scope = nock('http://example.invalid').head('/').reply(200);
		const results = await check({ path: 'test/fixtures/basic' });
		assert.ok(results.passed);
		scope.done();
	});

	it('should only try a link once', async () => {
		const scope = nock('http://example.invalid').head('/').reply(200);
		const results = await check({ path: 'test/fixtures/twice' });
		assert.ok(results.passed);
		assert.strictEqual(results.links.length, 2);
		scope.done();
	});

	it('should only queue a link once', async () => {
		const scope = nock('http://example.invalid').head('/').reply(200);
		const checker = new LinkChecker();
		const checkerSpy = vi.spyOn(checker, 'crawl');
		const results = await checker.check({ path: 'test/fixtures/twice' });
		assert.ok(results.passed);
		assert.strictEqual(results.links.length, 2);
		assert.strictEqual(checkerSpy.mock.calls.length, 2);
		scope.done();
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
		const scope = nock('https://good.com').head('/').reply(200);
		const results = await check({
			path: 'test/fixtures/filter',
			linksToSkip: async (link) => link.includes('filterme'),
		});
		assert.ok(results.passed);
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.SKIPPED).length,
			2,
		);
		scope.done();
	});

	it('should report broken links', async () => {
		const scope = nock('http://example.invalid').head('/').reply(404);
		const results = await check({ path: 'test/fixtures/broke' });
		assert.ok(!results.passed);
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.BROKEN).length,
			1,
		);
		scope.done();
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
			.spyOn(global, 'fetch')
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
		const results = await check({ path: 'test/fixtures/malformed' });
		assert.ok(!results.passed);
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.BROKEN).length,
			1,
		);
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
			const scope = nock('http://example.invalid')
				.get('/pageBase/index')
				.replyWithFile(200, fixture, {
					'Content-Type': 'text/html; charset=UTF-8',
				})
				.head(nonBrokenUrl)
				.reply(200);

			const results = await check({
				path: 'http://example.invalid/pageBase/index',
			});

			assert.strictEqual(results.links.length, 3);
			assert.strictEqual(
				results.links.filter((x) => x.state === LinkState.BROKEN).length,
				1,
			);
			scope.done();
		}
	});

	it('should detect relative urls with absolute base', async () => {
		const scope = nock('http://example.invalid')
			.get('/pageBase/index')
			.replyWithFile(200, 'test/fixtures/basetag/absolute.html', {
				'Content-Type': 'text/html; charset=UTF-8',
			});

		const anotherScope = nock('http://another.example.invalid')
			.head('/ok')
			.reply(200);

		const results = await check({
			path: 'http://example.invalid/pageBase/index',
		});

		assert.strictEqual(results.links.length, 3);
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.BROKEN).length,
			1,
		);
		scope.done();
		anotherScope.done();
	});

	it('should detect broken image links', async () => {
		const results = await check({ path: 'test/fixtures/image' });
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.BROKEN).length,
			2,
		);
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.OK).length,
			2,
		);
	});

	it('should perform a recursive scan', async () => {
		// This test is making sure that we do a recursive scan of links,
		// but also that we don't follow links to another site
		const scope = nock('http://example.invalid').head('/').reply(200);
		const results = await check({
			path: 'test/fixtures/recurse',
			recurse: true,
		});
		assert.strictEqual(results.links.length, 4);
		scope.done();
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
		const scopes = [
			nock('http://example.invalid').head('/').reply(405),
			nock('http://example.invalid').get('/').reply(200),
		];
		const results = await check({ path: 'test/fixtures/basic' });
		assert.ok(results.passed);
		for (const x of scopes) {
			x.done();
		}
	});

	it('should only follow links on the same origin domain', async () => {
		const scopes = [
			nock('http://example.invalid')
				.get('/')
				.replyWithFile(200, path.resolve('test/fixtures/baseurl/index.html'), {
					'content-type': 'text/html',
				}),
			nock('http://example.invalid.br').head('/deep.html').reply(200),
		];
		const results = await check({
			path: 'http://example.invalid',
			recurse: true,
		});
		assert.strictEqual(results.links.length, 2);
		assert.ok(results.passed);
		for (const x of scopes) {
			x.done();
		}
	});

	it('should not attempt to validate preconnect or prefetch urls', async () => {
		const scope = nock('http://example.invalid')
			.head('/site.css')
			.reply(200, '');
		const results = await check({ path: 'test/fixtures/prefetch' });
		scope.done();
		assert.ok(results.passed);
		assert.strictEqual(results.links.length, 2);
	});

	it('should attempt a GET request if a HEAD request fails on external links', async () => {
		const scopes = [
			nock('http://example.invalid').head('/').reply(403),
			nock('http://example.invalid').get('/').reply(200),
		];
		const results = await check({ path: 'test/fixtures/basic' });
		assert.ok(results.passed);
		for (const x of scopes) {
			x.done();
		}
	});

	it('should support a configurable timeout', async () => {
		nock('http://example.invalid').head('/').delay(200).reply(200);
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
		const scope = nock('http://example.invalid').head('/').reply(200);
		const results = await check({
			path: ['test/fixtures/basic', 'test/fixtures/image'],
		});
		assert.strictEqual(results.passed, false);
		assert.strictEqual(results.links.length, 6);
		scope.done();
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
		const scope = nock('http://example.invalid').head('/').reply(200);
		const results = await check(options);
		assert.ok(results.passed);
		scope.done();
		assert.strictEqual(options.serverRoot, undefined);
	});

	it('should accept multiple http paths', async () => {
		const scopes = [
			nock('http://example.invalid')
				.get('/')
				.replyWithFile(200, 'test/fixtures/local/index.html', {
					'Content-Type': 'text/html; charset=UTF-8',
				}),
			nock('http://example.invalid')
				.get('/page2.html')
				.replyWithFile(200, 'test/fixtures/local/page2.html', {
					'Content-Type': 'text/html; charset=UTF-8',
				}),
			nock('http://fake2.local')
				.get('/')
				.replyWithFile(200, 'test/fixtures/local/index.html', {
					'Content-Type': 'text/html; charset=UTF-8',
				}),
			nock('http://fake2.local')
				.get('/page2.html')
				.replyWithFile(200, 'test/fixtures/local/page2.html', {
					'Content-Type': 'text/html; charset=UTF-8',
				}),
		];
		const results = await check({
			path: ['http://example.invalid', 'http://fake2.local'],
		});
		assert.ok(results.passed);
		for (const x of scopes) {
			x.done();
		}
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
		const scopes = [
			nock('http://example.invalid')
				.get('/', undefined, {
					reqheaders: { 'User-Agent': DEFAULT_USER_AGENT },
				})
				.replyWithFile(200, 'test/fixtures/local/index.html', {
					'Content-Type': 'text/html; charset=UTF-8',
				}),
			nock('http://example.invalid')
				.get('/page2.html', undefined, {
					reqheaders: { 'User-Agent': DEFAULT_USER_AGENT },
				})
				.replyWithFile(200, 'test/fixtures/local/page2.html', {
					'Content-Type': 'text/html; charset=UTF-8',
				}),
		];
		const results = await check({
			path: 'http://example.invalid',
		});
		assert.ok(results.passed);
		for (const x of scopes) {
			x.done();
		}
	});

	it('should surface call stacks on failures in the API', async () => {
		const results = await check({
			path: 'http://example.invalid',
		});
		assert.ok(!results.passed);
		const failureDetails = results.links[0].failureDetails;
		if (!failureDetails || failureDetails.length === 0) {
			assert.fail('unexpected failure details');
		}
		const error = failureDetails[0] as Error;
		assert.match(error.message, /Nock: Disallowed net connect for/);
	});

	it('should respect server root with globs', async () => {
		const scope = nock('http://example.invalid')
			.get('/doll1')
			.reply(200)
			.get('/doll2')
			.reply(200);
		const results = await check({
			serverRoot: 'test/fixtures/nested',
			path: '*/*.html',
		});
		assert.strictEqual(results.links.length, 4);
		assert.ok(results.passed);
		scope.done();
	});

	it('should respect absolute server root', async () => {
		const scope = nock('http://example.invalid')
			.get('/doll1')
			.reply(200)
			.get('/doll2')
			.reply(200);
		const results = await check({
			serverRoot: path.resolve('test/fixtures/nested'),
			path: '*/*.html',
		});
		assert.strictEqual(results.links.length, 4);
		assert.ok(results.passed);
		scope.done();
	});

	it('should scan links in <meta content="URL"> tags', async () => {
		const scope = nock('http://example.invalid').head('/').reply(200);
		const results = await check({ path: 'test/fixtures/twittercard' });
		assert.ok(results.passed);
		scope.done();
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
		const scope = nock('http://example.invalid').head('/').reply(200);
		const results = await check({ path: 'test/fixtures/basic' });
		assert.strictEqual(results.links.length, 2);
		const [rootLink, fakeLink] = results.links;
		assert.strictEqual(rootLink.url, path.join('test', 'fixtures', 'basic'));
		assert.strictEqual(fakeLink.url, 'http://example.invalid/');
		scope.done();
	});

	it('should provide a server root relative path in the results', async () => {
		const scope = nock('http://example.invalid').head('/').reply(200);
		const results = await check({
			path: '.',
			serverRoot: 'test/fixtures/basic',
		});
		assert.strictEqual(results.links.length, 2);
		const [rootLink, fakeLink] = results.links;
		assert.strictEqual(rootLink.url, `.${path.sep}`);
		assert.strictEqual(fakeLink.url, 'http://example.invalid/');
		scope.done();
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

	it('should report malformed links as broken', async () => {
		const results = await check({ path: 'test/fixtures/malformed' });
		assert.ok(!results.passed);
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.BROKEN).length,
			1,
		);
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
		const scope = nock('http://example.invalid')
			.head('/')
			.matchHeader('user-agent', userAgent)
			.reply(200);
		const results = await check({ path: 'test/fixtures/basic', userAgent });
		assert.ok(results.passed);
		scope.done();
	});

	it('should handle extra headers', async () => {
		const scope = nock('http://example.invalid', {
			reqheaders: { 'sec-ch-ua-platform': 'Linux' },
		})
			.head('/')
			.reply(200);
		const checker = new LinkChecker();
		const results = await checker.check({
			path: 'test/fixtures/basic',
			extraHeaders: { 'sec-ch-ua-platform': 'Linux' },
		});
		assert.ok(results.passed);
		scope.done();
	});
});
