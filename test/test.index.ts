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
		// 3. second.html (from first.html)
		// 4. http://example.invalid (from second.html, external link)
		// Note: the "/" link from first.html pointing back to index is not
		// reported again since it's an OK link (only broken links are
		// reported for all parents to avoid result inflation)
		assert.strictEqual(results.links.length, 4);
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
		// 5. boo.jpg (from README.md)
		// 6. mailto link (from LICENSE.md)
		// Note: LICENSE.md is NOT reported again from README.md, unlinked.md,
		// and deep/deep.md since it's an OK link (only broken links are
		// reported for all parents to avoid result inflation)
		assert.strictEqual(results.links.length, 6);
		const licenseLinks = results.links.filter((x) =>
			x.url.endsWith('LICENSE.md'),
		);
		assert.strictEqual(licenseLinks.length, 1);
		assert.ok(licenseLinks[0].url, 'test/fixtures/markdown/LICENSE.md');
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

	it('should send Node.js default User-Agent by default', async () => {
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
				headers: (headers) => {
					// Verify Node.js default User-Agent is sent (not a browser UA)
					return headers['user-agent'] === 'node';
				},
			})
			.reply(200, indexContent, {
				headers: { 'content-type': 'text/html; charset=UTF-8' },
			});
		mockPool
			.intercept({
				path: '/page2.html',
				method: 'GET',
				headers: (headers) => {
					return headers['user-agent'] === 'node';
				},
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

	it('should merge custom headers with User-Agent when provided', async () => {
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
			userAgent: DEFAULT_USER_AGENT,
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

	it('should extract URLs from meta refresh tags', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/redirected', method: 'HEAD' }).reply(200, '');
		mockPool.intercept({ path: '/delayed', method: 'HEAD' }).reply(200, '');
		mockPool.intercept({ path: '/uppercase', method: 'HEAD' }).reply(200, '');
		const results = await check({ path: 'test/fixtures/metarefresh' });
		assert.ok(results.passed);
		// Should find 3 meta refresh URLs
		const metaRefreshLinks = results.links.filter((link) =>
			link.url?.includes('example.invalid'),
		);
		assert.strictEqual(metaRefreshLinks.length, 3);
	});

	it('should extract URLs from inline CSS in style attributes and tags when checkCss is enabled', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		// Mock all CSS-related URLs
		mockPool.intercept({ path: '/div-bg.jpg', method: 'HEAD' }).reply(200, '');
		mockPool.intercept({ path: '/bg1.png', method: 'HEAD' }).reply(200, '');
		mockPool.intercept({ path: '/bg2.png', method: 'HEAD' }).reply(200, '');
		mockPool
			.intercept({ path: '/bg-inline.jpg', method: 'HEAD' })
			.reply(200, '');
		mockPool
			.intercept({ path: '/header-bg.png', method: 'HEAD' })
			.reply(200, '');
		mockPool
			.intercept({ path: '/imported.css', method: 'HEAD' })
			.reply(200, '');
		mockPool
			.intercept({ path: '/imported2.css', method: 'HEAD' })
			.reply(200, '');
		mockPool
			.intercept({ path: '/regular-link', method: 'HEAD' })
			.reply(200, '');

		const results = await check({ path: 'test/fixtures/css', checkCss: true });
		assert.ok(results.passed);

		// Count URLs extracted from inline styles
		const inlineStyleUrls = results.links.filter((link) =>
			link.url?.includes('example.invalid'),
		);

		// Should find at least:
		// - div-bg.jpg (inline style attribute)
		// - bg1.png, bg2.png (multiple backgrounds in style attribute)
		// - bg-inline.jpg (style tag)
		// - header-bg.png (style tag)
		// - imported.css, imported2.css (@import in style tag)
		// - regular-link (regular anchor)
		assert.ok(
			inlineStyleUrls.length >= 8,
			`Expected at least 8 URLs from inline styles, found ${inlineStyleUrls.length}`,
		);
	});

	it('should NOT extract URLs from inline CSS when checkCss is disabled', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool
			.intercept({ path: '/regular-link', method: 'HEAD' })
			.reply(200, '');

		const results = await check({ path: 'test/fixtures/css', checkCss: false });
		assert.ok(results.passed);

		// Count URLs extracted - should only find regular link, not CSS URLs
		const exampleInvalidUrls = results.links.filter((link) =>
			link.url?.includes('example.invalid'),
		);

		// Should only find the regular anchor link, not CSS URLs
		assert.strictEqual(
			exampleInvalidUrls.length,
			1,
			`Expected only 1 URL (regular link), found ${exampleInvalidUrls.length}`,
		);
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

	it('should resolve clean URLs when enabled', async () => {
		// Test with cleanUrls enabled
		const results = await check({
			path: 'test/fixtures/server/clean-urls',
			recurse: true,
			cleanUrls: true,
		});

		assert.ok(
			results.passed,
			'All links should be valid with cleanUrls enabled',
		);
		// Should find: index.html (root) + about + contact (relative paths)
		// Match flexibly for cross-platform compatibility
		const aboutLink = results.links.find(
			(x) => x.url.includes('about') && !x.url.includes('about.html'),
		);
		assert.ok(aboutLink, 'Should find the about link');
		assert.strictEqual(
			aboutLink?.state,
			LinkState.OK,
			'about should resolve to about.html',
		);

		const contactLink = results.links.find(
			(x) => x.url.includes('contact') && !x.url.includes('contact.html'),
		);
		assert.ok(contactLink, 'Should find the contact link');
		assert.strictEqual(
			contactLink?.state,
			LinkState.OK,
			'contact should resolve to contact.html',
		);
	});

	it('should NOT resolve clean URLs when disabled', async () => {
		// Test with cleanUrls disabled (default behavior)
		const results = await check({
			path: 'test/fixtures/server/clean-urls',
			recurse: true,
			cleanUrls: false,
		});

		assert.ok(!results.passed, 'Should fail with cleanUrls disabled');
		// The about link should be broken (can't find about.html without cleanUrls)
		// Match flexibly for cross-platform compatibility
		const aboutLink = results.links.find(
			(x) => x.url.includes('about') && !x.url.includes('about.html'),
		);
		assert.ok(aboutLink, 'Should find the about link');
		assert.strictEqual(
			aboutLink?.state,
			LinkState.BROKEN,
			'about should be broken without cleanUrls',
		);
	});

	it('should resolve relative URLs without ./ prefix correctly (issue #374)', async () => {
		// This test reproduces issue #374: relative URLs without "./" prefix
		// should resolve to the current directory, not the parent directory.
		//
		// When a page at /apps/web contains <a href="harmonograph">, it should
		// resolve to /apps/web/harmonograph (current directory), not /apps/harmonograph
		const mockPool = mockAgent.get('http://example.invalid');

		const htmlContent = `
			<html>
				<body>
					<a href="harmonograph">Relative link without prefix</a>
					<a href="./other">Relative link with ./ prefix</a>
				</body>
			</html>
		`;

		// Page at /apps/web returns HTML content
		mockPool
			.intercept({
				path: '/apps/web',
				method: 'GET',
			})
			.reply(200, htmlContent, {
				headers: { 'content-type': 'text/html' },
			});

		// Mock the expected correct resolution: /apps/web/harmonograph
		// These links will be checked with GET since they're being crawled (recurse: true)
		mockPool
			.intercept({ path: '/apps/web/harmonograph', method: 'GET' })
			.reply(200, '');

		// Mock the expected correct resolution: /apps/web/other
		mockPool
			.intercept({ path: '/apps/web/other', method: 'GET' })
			.reply(200, '');

		const results = await check({
			path: 'http://example.invalid/apps/web',
			recurse: true,
		});

		// All links should pass
		assert.ok(results.passed, 'All links should be valid');

		// Verify that "harmonograph" was resolved to /apps/web/harmonograph
		const harmonographLink = results.links.find((x) =>
			x.url.includes('harmonograph'),
		);
		assert.ok(harmonographLink, 'Should find the harmonograph link');
		assert.strictEqual(
			harmonographLink?.url,
			'http://example.invalid/apps/web/harmonograph',
			'harmonograph should resolve to /apps/web/harmonograph, not /apps/harmonograph',
		);
		assert.strictEqual(
			harmonographLink?.state,
			LinkState.OK,
			'harmonograph link should be OK',
		);

		// Verify that "./other" was also resolved correctly
		const otherLink = results.links.find((x) => x.url.includes('other'));
		assert.ok(otherLink, 'Should find the other link');
		assert.strictEqual(
			otherLink?.url,
			'http://example.invalid/apps/web/other',
			'other should resolve to /apps/web/other',
		);
		assert.strictEqual(
			otherLink?.state,
			LinkState.OK,
			'other link should be OK',
		);
	});
});
