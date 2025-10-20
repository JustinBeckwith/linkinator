import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from 'undici';
import {
	afterEach,
	assert,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';
import {
	type CheckOptions,
	check,
	LinkChecker,
	LinkState,
} from '../src/index.js';
import { DEFAULT_USER_AGENT } from '../src/options.js';

describe('linkinator', () => {
	let mockAgent: MockAgent;
	let originalDispatcher: ReturnType<typeof getGlobalDispatcher>;

	beforeEach(() => {
		// Save original dispatcher and create mock agent
		originalDispatcher = getGlobalDispatcher();
		mockAgent = new MockAgent();
		mockAgent.disableNetConnect();
		// Allow ALL localhost connections for local server tests
		mockAgent.enableNetConnect((host) => {
			return host.includes('localhost') || host.includes('127.0.0.1');
		});
		setGlobalDispatcher(mockAgent);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		// Assert all mocked requests were called (equivalent to nock's scope.done())
		mockAgent.assertNoPendingInterceptors();
		// Close mock agent and restore original dispatcher
		await mockAgent.close();
		setGlobalDispatcher(originalDispatcher);
	});

	it('should perform a basic shallow scan', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/', method: 'HEAD' }).reply(200, '');
		const results = await check({ path: 'test/fixtures/basic' });
		assert.ok(results.passed);
	});

	it('should only try a link once', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/', method: 'HEAD' }).reply(200, '');
		const results = await check({ path: 'test/fixtures/twice' });
		assert.ok(results.passed);
		assert.strictEqual(results.links.length, 2);
	});

	it('should only queue a link once', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/', method: 'HEAD' }).reply(200, '');
		const checker = new LinkChecker();
		const checkerSpy = vi.spyOn(checker, 'crawl');
		const results = await checker.check({ path: 'test/fixtures/twice' });
		assert.ok(results.passed);
		assert.strictEqual(results.links.length, 2);
		assert.strictEqual(checkerSpy.mock.calls.length, 2);
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
		const mockPool = mockAgent.get('https://good.com');
		mockPool.intercept({ path: '/', method: 'HEAD' }).reply(200, '');
		const results = await check({
			path: 'test/fixtures/filter',
			linksToSkip: async (link) => link.includes('filterme'),
		});
		assert.ok(results.passed);
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.SKIPPED).length,
			2,
		);
	});

	it('should report broken links', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/', method: 'HEAD' }).reply(404, '');
		const results = await check({ path: 'test/fixtures/broke' });
		assert.ok(!results.passed);
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.BROKEN).length,
			1,
		);
	});

	it('should skip links with 999 status (bot-protected)', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/', method: 'HEAD' }).reply(999, '');
		const results = await check({ path: 'test/fixtures/basic' });
		assert.ok(results.passed);
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.SKIPPED).length,
			1,
		);
		const skippedLink = results.links.find(
			(x) => x.state === LinkState.SKIPPED,
		);
		assert.strictEqual(skippedLink?.status, 999);
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
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool
			.intercept({ path: '/', method: 'HEAD' })
			.replyWithError(new Error('Fetch error'));
		mockPool
			.intercept({ path: '/', method: 'GET' })
			.replyWithError(new Error('Fetch error'));
		const results = await check({ path: 'test/fixtures/basic' });
		assert.ok(!results.passed);
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.BROKEN).length,
			1,
		);
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
			const mockPool = mockAgent.get('http://example.invalid');
			const fileContent = fs.readFileSync(fixture, 'utf8');
			mockPool
				.intercept({ path: '/pageBase/index', method: 'GET' })
				.reply(200, fileContent, {
					headers: { 'content-type': 'text/html; charset=UTF-8' },
				});
			mockPool.intercept({ path: nonBrokenUrl, method: 'HEAD' }).reply(200, '');

			const results = await check({
				path: 'http://example.invalid/pageBase/index',
			});

			assert.strictEqual(results.links.length, 3);
			assert.strictEqual(
				results.links.filter((x) => x.state === LinkState.BROKEN).length,
				1,
			);
		}
	});

	it('should detect relative urls with absolute base', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		const fileContent = fs.readFileSync(
			'test/fixtures/basetag/absolute.html',
			'utf8',
		);
		mockPool
			.intercept({ path: '/pageBase/index', method: 'GET' })
			.reply(200, fileContent, {
				headers: { 'content-type': 'text/html; charset=UTF-8' },
			});

		const anotherMockPool = mockAgent.get('http://another.example.invalid');
		anotherMockPool.intercept({ path: '/ok', method: 'HEAD' }).reply(200, '');

		const results = await check({
			path: 'http://example.invalid/pageBase/index',
		});

		assert.strictEqual(results.links.length, 3);
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.BROKEN).length,
			1,
		);
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
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/', method: 'HEAD' }).reply(200, '');
		const results = await check({
			path: 'test/fixtures/recurse',
			recurse: true,
		});
		// Expected results:
		// 1. index.html (starting page, parent: undefined)
		// 2. first.html (from index.html)
		// 3. / (from first.html, points back to index - now reported with parent)
		// 4. second.html (from first.html)
		// 5. http://example.invalid (from second.html, external link)
		assert.strictEqual(results.links.length, 5);
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
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/', method: 'HEAD' }).reply(405, '');
		mockPool.intercept({ path: '/', method: 'GET' }).reply(200, '');
		const results = await check({ path: 'test/fixtures/basic' });
		assert.ok(results.passed);
	});

	it('should only follow links on the same origin domain', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		const fileContent = fs.readFileSync(
			path.resolve('test/fixtures/baseurl/index.html'),
			'utf8',
		);
		mockPool
			.intercept({ path: '/', method: 'GET' })
			.reply(200, fileContent, { headers: { 'content-type': 'text/html' } });

		const mockPool2 = mockAgent.get('http://example.invalid.br');
		mockPool2.intercept({ path: '/deep.html', method: 'HEAD' }).reply(200, '');

		const results = await check({
			path: 'http://example.invalid',
			recurse: true,
		});
		assert.strictEqual(results.links.length, 2);
		assert.ok(results.passed);
	});

	it('should not attempt to validate preconnect or prefetch urls', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/site.css', method: 'HEAD' }).reply(200, '');
		const results = await check({ path: 'test/fixtures/prefetch' });
		assert.ok(results.passed);
		assert.strictEqual(results.links.length, 2);
	});

	it('should attempt a GET request if a HEAD request fails on external links', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/', method: 'HEAD' }).reply(403, '');
		mockPool.intercept({ path: '/', method: 'GET' }).reply(200, '');
		const results = await check({ path: 'test/fixtures/basic' });
		assert.ok(results.passed);
	});

	it('should support a configurable timeout', async () => {
		// No mock needed - the request will timeout before any response
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
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/', method: 'HEAD' }).reply(200, '');
		const results = await check({
			path: ['test/fixtures/basic', 'test/fixtures/image'],
		});
		assert.strictEqual(results.passed, false);
		assert.strictEqual(results.links.length, 6);
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
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/', method: 'HEAD' }).reply(200, '');
		const results = await check(options);
		assert.ok(results.passed);
		assert.strictEqual(options.serverRoot, undefined);
	});

	it('should accept multiple http paths', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		const indexContent = fs.readFileSync(
			'test/fixtures/local/index.html',
			'utf8',
		);
		const page2Content = fs.readFileSync(
			'test/fixtures/local/page2.html',
			'utf8',
		);
		mockPool.intercept({ path: '/', method: 'GET' }).reply(200, indexContent, {
			headers: { 'content-type': 'text/html; charset=UTF-8' },
		});
		mockPool
			.intercept({ path: '/page2.html', method: 'GET' })
			.reply(200, page2Content, {
				headers: { 'content-type': 'text/html; charset=UTF-8' },
			});

		const mockPool2 = mockAgent.get('http://fake2.local');
		mockPool2.intercept({ path: '/', method: 'GET' }).reply(200, indexContent, {
			headers: { 'content-type': 'text/html; charset=UTF-8' },
		});
		mockPool2
			.intercept({ path: '/page2.html', method: 'GET' })
			.reply(200, page2Content, {
				headers: { 'content-type': 'text/html; charset=UTF-8' },
			});

		const results = await check({
			path: ['http://example.invalid', 'http://fake2.local'],
		});
		assert.ok(results.passed);
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
		// Expected results:
		// 1. README.md (starting page)
		// 2. LICENSE.md (starting page)
		// 3. deep/deep.md (starting page)
		// 4. unlinked.md (starting page)
		// 5. LICENSE.md (from README.md)
		// 6. LICENSE.md (from unlinked.md)
		// 7. LICENSE.md (from deep/deep.md)
		// 8. boo.jpg (from README.md)
		// 9. mailto link (from LICENSE.md)
		assert.strictEqual(results.links.length, 9);
		const licenseLinks = results.links.filter((x) =>
			x.url.endsWith('LICENSE.md'),
		);
		// LICENSE.md should appear 4 times: once as a starting page, then from README.md, unlinked.md, and deep/deep.md
		assert.strictEqual(licenseLinks.length, 4);
		// Verify LICENSE.md is reported with different parents
		const licenseLinkParents = licenseLinks
			.map((x) => x.parent)
			.filter((p) => p !== undefined);
		assert.strictEqual(licenseLinkParents.length, 3);
		assert.ok(
			licenseLinkParents.some((p) => p?.includes('README.md')),
			'LICENSE.md should be reported from README.md',
		);
		assert.ok(
			licenseLinkParents.some((p) => p?.includes('unlinked.md')),
			'LICENSE.md should be reported from unlinked.md',
		);
		assert.ok(
			licenseLinkParents.some((p) => p?.includes('deep.md')),
			'LICENSE.md should be reported from deep/deep.md',
		);
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
		const mockPool = mockAgent.get('http://example.invalid');
		const indexContent = fs.readFileSync(
			'test/fixtures/local/index.html',
			'utf8',
		);
		const page2Content = fs.readFileSync(
			'test/fixtures/local/page2.html',
			'utf8',
		);
		mockPool
			.intercept({
				path: '/',
				method: 'GET',
				headers: { 'user-agent': DEFAULT_USER_AGENT },
			})
			.reply(200, indexContent, {
				headers: { 'content-type': 'text/html; charset=UTF-8' },
			});
		mockPool
			.intercept({
				path: '/page2.html',
				method: 'GET',
				headers: { 'user-agent': DEFAULT_USER_AGENT },
			})
			.reply(200, page2Content, {
				headers: { 'content-type': 'text/html; charset=UTF-8' },
			});

		const results = await check({
			path: 'http://example.invalid',
		});
		assert.ok(results.passed);
	});

	it('should pass custom headers in requests', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool
			.intercept({
				path: '/',
				method: 'HEAD',
				headers: (headers) => {
					// Verify that custom headers are present
					return (
						headers['x-my-header'] === 'my-value' &&
						headers.authorization === 'Bearer token123'
					);
				},
			})
			.reply(200, '');
		const results = await check({
			path: 'test/fixtures/basic',
			headers: {
				'X-My-Header': 'my-value',
				Authorization: 'Bearer token123',
			},
		});
		assert.ok(results.passed);
	});

	it('should merge custom headers with User-Agent', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool
			.intercept({
				path: '/',
				method: 'HEAD',
				headers: (headers) => {
					// Verify that both User-Agent and custom headers are present
					return (
						headers['user-agent']?.includes('Mozilla') &&
						headers['x-custom'] === 'test-value'
					);
				},
			})
			.reply(200, '');
		const results = await check({
			path: 'test/fixtures/basic',
			headers: {
				'X-Custom': 'test-value',
			},
		});
		assert.ok(results.passed);
	});

	it('should pass headers in GET fallback requests', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		// First HEAD request returns 405
		mockPool
			.intercept({
				path: '/',
				method: 'HEAD',
			})
			.reply(405, '');
		// GET fallback should also have custom headers
		mockPool
			.intercept({
				path: '/',
				method: 'GET',
				headers: (headers) => {
					return headers['x-fallback-test'] === 'fallback-value';
				},
			})
			.reply(200, '');
		const results = await check({
			path: 'test/fixtures/basic',
			headers: {
				'X-Fallback-Test': 'fallback-value',
			},
		});
		assert.ok(results.passed);
	});

	it('should allow custom User-Agent override', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool
			.intercept({
				path: '/',
				method: 'HEAD',
				headers: (headers) => {
					// Custom User-Agent should override the default
					return headers['user-agent'] === 'CustomBot/1.0';
				},
			})
			.reply(200, '');
		const results = await check({
			path: 'test/fixtures/basic',
			userAgent: 'CustomBot/1.0',
		});
		assert.ok(results.passed);
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
		// MockAgent returns 'fetch failed' or similar error messages
		assert.ok(error.message.length > 0);
	});

	it('should respect server root with globs', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/doll1', method: 'GET' }).reply(200, '');
		mockPool.intercept({ path: '/doll2', method: 'GET' }).reply(200, '');
		const results = await check({
			serverRoot: 'test/fixtures/nested',
			path: '*/*.html',
		});
		assert.strictEqual(results.links.length, 4);
		assert.ok(results.passed);
	});

	it('should respect absolute server root', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/doll1', method: 'GET' }).reply(200, '');
		mockPool.intercept({ path: '/doll2', method: 'GET' }).reply(200, '');
		const results = await check({
			serverRoot: path.resolve('test/fixtures/nested'),
			path: '*/*.html',
		});
		assert.strictEqual(results.links.length, 4);
		assert.ok(results.passed);
	});

	it('should scan links in <meta content="URL"> tags', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/', method: 'HEAD' }).reply(200, '');
		const results = await check({ path: 'test/fixtures/twittercard' });
		assert.ok(results.passed);
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
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/', method: 'HEAD' }).reply(200, '');
		const results = await check({ path: 'test/fixtures/basic' });
		assert.strictEqual(results.links.length, 2);
		const [rootLink, fakeLink] = results.links;
		assert.strictEqual(rootLink.url, path.join('test', 'fixtures', 'basic'));
		assert.strictEqual(fakeLink.url, 'http://example.invalid/');
	});

	it('should provide a server root relative path in the results', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/', method: 'HEAD' }).reply(200, '');
		const results = await check({
			path: '.',
			serverRoot: 'test/fixtures/basic',
		});
		assert.strictEqual(results.links.length, 2);
		const [rootLink, fakeLink] = results.links;
		assert.strictEqual(rootLink.url, `.${path.sep}`);
		assert.strictEqual(fakeLink.url, 'http://example.invalid/');
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
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool
			.intercept({
				path: '/',
				method: 'HEAD',
				headers: { 'user-agent': userAgent },
			})
			.reply(200, '');
		const results = await check({ path: 'test/fixtures/basic', userAgent });
		assert.ok(results.passed);
	});

	it('should skip Cloudflare bot protection (403 with cf-mitigated)', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		// Simulate Cloudflare bot protection response
		mockPool.intercept({ path: '/', method: 'HEAD' }).reply(403, '', {
			headers: {
				'cf-mitigated': 'challenge',
				server: 'cloudflare',
			},
		});
		const results = await check({ path: 'test/fixtures/basic' });
		// Should pass because Cloudflare 403 with cf-mitigated is skipped, not broken
		assert.ok(results.passed);
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.SKIPPED).length,
			1,
		);
		const skippedLink = results.links.find(
			(x) => x.state === LinkState.SKIPPED,
		);
		assert.strictEqual(skippedLink?.status, 403);
	});

	it('should check alternate and canonical link tags', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/', method: 'HEAD' }).reply(200, '');
		mockPool.intercept({ path: '/es', method: 'HEAD' }).reply(200, '');
		const results = await check({ path: 'test/fixtures/alternate' });
		assert.ok(results.passed);
		// Should check: 1 page + 2 unique URLs (http://example.invalid/ and /es) = 3 total
		// Note: The 4 link tags contain only 2 unique URLs since canonical and some alternates point to /
		assert.strictEqual(results.links.length, 3);
		assert.strictEqual(
			results.links.filter((x) => x.state === LinkState.OK).length,
			3,
		);
	});

	it('should report broken links for all parent pages', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/broken123', method: 'HEAD' }).reply(404, '');
		mockPool.intercept({ path: '/broken456', method: 'HEAD' }).reply(404, '');
		mockPool.intercept({ path: '/broken789', method: 'HEAD' }).reply(404, '');
		const results = await check({
			path: [
				'test/fixtures/repeated-broken-link/pageA.html',
				'test/fixtures/repeated-broken-link/pageB.html',
			],
		});
		assert.ok(!results.passed);

		// We should have 6 results: 2 pages + 4 broken links (broken123 appears twice)
		// pageA.html with parent undefined
		// pageB.html with parent undefined
		// broken123 with parent pageA.html
		// broken456 with parent pageA.html
		// broken123 with parent pageB.html (this is the key - same broken link, different parent)
		// broken789 with parent pageB.html
		assert.strictEqual(results.links.length, 6);

		// Check that broken123 appears twice with different parents
		const broken123Links = results.links.filter(
			(x) => x.url === 'http://example.invalid/broken123',
		);
		assert.strictEqual(broken123Links.length, 2);

		const parents = broken123Links.map((x) => x.parent).sort();
		assert.ok(
			parents[0]?.includes('pageA.html'),
			'broken123 should be reported for pageA.html',
		);
		assert.ok(
			parents[1]?.includes('pageB.html'),
			'broken123 should be reported for pageB.html',
		);
	});

	it('should resolve relative links correctly when URL has trailing slash', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		// Test that when a URL has a trailing slash, relative links like ../../manage/api-keys
		// are resolved correctly relative to that directory
		const htmlContent = `
			<html>
				<body>
					<a href="../../manage/api-keys">API Keys</a>
					<a href="../../manage/branches/">Branches</a>
				</body>
			</html>
		`;
		mockPool
			.intercept({
				path: '/docs/reference/api-reference/',
				method: 'GET',
			})
			.reply(200, htmlContent, {
				headers: { 'content-type': 'text/html' },
			});
		mockPool
			.intercept({ path: '/docs/manage/api-keys', method: 'HEAD' })
			.reply(200, '');
		mockPool
			.intercept({ path: '/docs/manage/branches/', method: 'HEAD' })
			.reply(200, '');

		const results = await check({
			path: 'http://example.invalid/docs/reference/api-reference/',
			recurse: true,
		});

		assert.ok(results.passed, 'All links should be valid');
		// Should find: the page itself + 2 relative links
		assert.strictEqual(results.links.length, 3);
		// Verify the links were resolved correctly relative to the trailing slash URL
		const apiKeysLink = results.links.find((x) =>
			x.url.includes('manage/api-keys'),
		);
		assert.ok(
			apiKeysLink,
			'Should find the api-keys link resolved relative to trailing slash',
		);
	});
});
