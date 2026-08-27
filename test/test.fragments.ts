import { Readable } from 'node:stream';
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { check, LinkChecker, LinkState } from '../src/index.js';
import { extractFragmentIds, validateFragments } from '../src/links.js';

describe('fragment identifier validation', () => {
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

	it('should extract fragment IDs from HTML with id attributes', async () => {
		const html = `
			<html>
				<body>
					<div id="section-one">Content</div>
					<div id="section-two">Content</div>
					<span id="inline-section">Text</span>
				</body>
			</html>
		`;
		const stream = Readable.from([html]);
		const fragments = await extractFragmentIds(stream);

		expect(fragments.has('section-one')).toBe(true);
		expect(fragments.has('section-two')).toBe(true);
		expect(fragments.has('inline-section')).toBe(true);
		expect(fragments.size).toBe(3);
	});

	it('should extract fragment IDs from anchor name attributes', async () => {
		const html = `
			<html>
				<body>
					<a name="old-style-anchor">Link</a>
					<a id="modern-anchor">Link</a>
				</body>
			</html>
		`;
		const stream = Readable.from([html]);
		const fragments = await extractFragmentIds(stream);

		expect(fragments.has('old-style-anchor')).toBe(true);
		expect(fragments.has('modern-anchor')).toBe(true);
		expect(fragments.size).toBe(2);
	});

	it('should return empty set for HTML without fragments', async () => {
		const html = `
			<html>
				<body>
					<div>No IDs here</div>
				</body>
			</html>
		`;
		const stream = Readable.from([html]);
		const fragments = await extractFragmentIds(stream);

		expect(fragments.size).toBe(0);
	});

	it('should validate valid fragment identifiers when checkFragments is enabled', async () => {
		const mockPool = mockAgent.get('http://example.com');

		// Mock the response for the page with fragment
		mockPool
			.intercept({ path: '/page.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });

		mockPool
			.intercept({ path: '/page.html', method: 'GET' })
			.reply(
				200,
				'<html><body><div id="valid-section">Content</div></body></html>',
				{ headers: { 'content-type': 'text/html' } },
			);

		const results = await check({
			path: 'test/fixtures/fragments-valid',
			checkFragments: true,
		});

		// Should pass because the fragment exists
		expect(results.passed).toBe(true);

		// Should have both the base URL and the fragment URL
		const baseUrlResult = results.links.find(
			(l) => l.url === 'http://example.com/page.html',
		);
		expect(baseUrlResult?.state).toBe(LinkState.OK);
	});

	it('should mark invalid fragment identifiers as broken when checkFragments is enabled', async () => {
		const mockPool = mockAgent.get('http://example.com');

		// Mock the response for the page without the fragment
		mockPool
			.intercept({ path: '/page.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });

		mockPool
			.intercept({ path: '/page.html', method: 'GET' })
			.reply(
				200,
				'<html><body><div id="different-section">Content</div></body></html>',
				{ headers: { 'content-type': 'text/html' } },
			);

		const results = await check({
			path: 'test/fixtures/fragments-invalid',
			checkFragments: true,
		});

		// Should fail because the fragment doesn't exist
		expect(results.passed).toBe(false);

		// Find the broken fragment link
		const fragmentResult = results.links.find(
			(l) => l.url === 'http://example.com/page.html#invalid-section',
		);
		expect(fragmentResult?.state).toBe(LinkState.BROKEN);
		expect(fragmentResult?.failureDetails?.[0]).toBeInstanceOf(Error);
		expect((fragmentResult?.failureDetails?.[0] as Error).message).toContain(
			"Fragment identifier '#invalid-section' not found on page",
		);
	});

	it('should retry transient fragment metadata server errors', async () => {
		const mockPool = mockAgent.get('http://example.com');
		mockPool
			.intercept({ path: '/page.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });
		mockPool
			.intercept({ path: '/page.html', method: 'GET' })
			.reply(500, 'retry', { headers: { 'content-type': 'text/html' } });
		mockPool
			.intercept({ path: '/page.html', method: 'GET' })
			.reply(200, '<div id="different-section">Content</div>', {
				headers: { 'content-type': 'text/html' },
			});
		const checker = new LinkChecker();
		const retries: Array<{ status: number; url: string }> = [];
		checker.on('retry', (event) => retries.push(event));

		const results = await checker.check({
			path: 'test/fixtures/fragments-invalid',
			checkFragments: true,
			retryErrors: true,
			retryErrorsCount: 1,
			retryErrorsJitter: 0,
		});

		expect(results.passed).toBe(false);
		expect(retries).toEqual([
			expect.objectContaining({
				status: 500,
				url: 'http://example.com/page.html',
			}),
		]);
		expect(
			results.links.find((result) => result.url.endsWith('#invalid-section'))
				?.state,
		).toBe(LinkState.BROKEN);
	});

	it('should keep exhausted fragment metadata network retries supplementary', async () => {
		const mockPool = mockAgent.get('http://example.com');
		mockPool
			.intercept({ path: '/page.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });
		mockPool
			.intercept({ path: '/page.html', method: 'GET' })
			.replyWithError(new Error('temporary metadata failure'));
		mockPool
			.intercept({ path: '/page.html', method: 'GET' })
			.replyWithError(new Error('metadata still unavailable'));
		const checker = new LinkChecker();
		const retries: Array<{ status: number; url: string }> = [];
		checker.on('retry', (event) => retries.push(event));

		const results = await checker.check({
			path: 'test/fixtures/fragments-invalid',
			checkFragments: true,
			retryErrors: true,
			retryErrorsCount: 1,
			retryErrorsJitter: 0,
		});

		expect(results.passed).toBe(true);
		expect(retries).toEqual([
			expect.objectContaining({
				status: 0,
				url: 'http://example.com/page.html',
			}),
		]);
		expect(
			results.links.some((result) => result.url.endsWith('#invalid-section')),
		).toBe(false);
	});

	it('should honor Retry-After for fragment metadata requests', async () => {
		const mockPool = mockAgent.get('http://example.com');
		mockPool
			.intercept({ path: '/page.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });
		mockPool
			.intercept({ path: '/page.html', method: 'GET' })
			.reply(429, 'retry', {
				headers: {
					'content-type': 'text/html',
					'retry-after': '0',
				},
			});
		mockPool
			.intercept({ path: '/page.html', method: 'GET' })
			.reply(200, '<div id="different-section">Content</div>', {
				headers: { 'content-type': 'text/html' },
			});
		const checker = new LinkChecker();
		const retries: Array<{ status: number; url: string }> = [];
		checker.on('retry', (event) => retries.push(event));

		const results = await checker.check({
			path: 'test/fixtures/fragments-invalid',
			checkFragments: true,
			retry: true,
		});

		expect(results.passed).toBe(false);
		expect(retries).toEqual([
			expect.objectContaining({
				status: 429,
				url: 'http://example.com/page.html',
			}),
		]);
		expect(
			results.links.find((result) => result.url.endsWith('#invalid-section'))
				?.state,
		).toBe(LinkState.BROKEN);
	});

	it('should check other fragment targets during Retry-After backoff', async () => {
		const mockPool = mockAgent.get('http://example.com');
		mockPool
			.intercept({ path: '/source.html', method: 'GET' })
			.reply(
				200,
				[
					'<a href="/slow.html#missing">Slow</a>',
					'<a href="/fast.html#missing">Fast</a>',
				].join(''),
				{ headers: { 'content-type': 'text/html' } },
			);
		for (const path of ['/slow.html', '/fast.html']) {
			mockPool
				.intercept({ path, method: 'HEAD' })
				.reply(200, '', { headers: { 'content-type': 'text/html' } });
		}
		const requestOrder: string[] = [];
		mockPool.intercept({ path: '/slow.html', method: 'GET' }).reply(() => {
			requestOrder.push('slow-429');
			return {
				statusCode: 429,
				data: 'retry',
				responseOptions: {
					headers: {
						'content-type': 'text/html',
						'retry-after': '0.1',
					},
				},
			};
		});
		mockPool.intercept({ path: '/slow.html', method: 'GET' }).reply(() => {
			requestOrder.push('slow-retry');
			return {
				statusCode: 200,
				data: '<div id="different">Slow target</div>',
				responseOptions: { headers: { 'content-type': 'text/html' } },
			};
		});
		mockPool.intercept({ path: '/fast.html', method: 'GET' }).reply(() => {
			requestOrder.push('fast');
			return {
				statusCode: 200,
				data: '<div id="different">Fast target</div>',
				responseOptions: { headers: { 'content-type': 'text/html' } },
			};
		});
		const checker = new LinkChecker();

		const results = await checker.check({
			path: 'http://example.com/source.html',
			checkFragments: true,
			concurrency: 1,
			retry: true,
		});

		expect(results.passed).toBe(false);
		expect(requestOrder).toEqual(['slow-429', 'fast', 'slow-retry']);
	});

	it('should apply error retries when fragment Retry-After is invalid', async () => {
		const mockPool = mockAgent.get('http://example.com');
		mockPool
			.intercept({ path: '/page.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });
		mockPool
			.intercept({ path: '/page.html', method: 'GET' })
			.reply(429, 'retry', {
				headers: {
					'content-type': 'text/html',
					'retry-after': 'not-a-date',
				},
			});
		mockPool
			.intercept({ path: '/page.html', method: 'GET' })
			.reply(200, '<div id="different-section">Content</div>', {
				headers: { 'content-type': 'text/html' },
			});
		const checker = new LinkChecker();
		const retries: Array<{ status: number; url: string }> = [];
		checker.on('retry', (event) => retries.push(event));

		const results = await checker.check({
			path: 'test/fixtures/fragments-invalid',
			checkFragments: true,
			retry: true,
			retryErrors: true,
			retryErrorsCount: 1,
			retryErrorsJitter: 0,
		});

		expect(results.passed).toBe(false);
		expect(retries).toEqual([
			expect.objectContaining({
				status: 429,
				url: 'http://example.com/page.html',
			}),
		]);
		expect(
			results.links.find((result) => result.url.endsWith('#invalid-section'))
				?.state,
		).toBe(LinkState.BROKEN);
	});

	it('should report an invalid fragment for every parent page', async () => {
		const mockPool = mockAgent.get('http://example.com');
		mockPool
			.intercept({ path: '/first.html', method: 'GET' })
			.reply(
				200,
				'<a href="/target.html#missing"><span></span></a><a href="/target.html#missing">First label</a>',
				{ headers: { 'content-type': 'text/html' } },
			);
		mockPool
			.intercept({ path: '/second.html', method: 'GET' })
			.reply(200, '<a href="/target.html#late-missing">Second label</a>', {
				headers: { 'content-type': 'text/html' },
			})
			.delay(100);
		mockPool
			.intercept({ path: '/target.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });
		mockPool
			.intercept({ path: '/target.html', method: 'GET' })
			.reply(
				200,
				'<div id="different">Content</div><a href="#different">Valid self link</a>',
				{
					headers: { 'content-type': 'text/html' },
				},
			);

		const results = await check({
			path: ['http://example.com/first.html', 'http://example.com/second.html'],
			checkFragments: true,
		});

		const fragmentResults = results.links.filter((result) =>
			result.url.includes('/target.html#'),
		);
		expect(fragmentResults).toHaveLength(2);
		expect(
			fragmentResults.map(({ displayText, parent, url }) => ({
				displayText,
				parent,
				url,
			})),
		).toEqual([
			{
				displayText: 'First label',
				parent: 'http://example.com/first.html',
				url: 'http://example.com/target.html#missing',
			},
			{
				displayText: 'Second label',
				parent: 'http://example.com/second.html',
				url: 'http://example.com/target.html#late-missing',
			},
		]);
	});

	it('should validate a fragment discovered after a non-fragment link', async () => {
		const mockPool = mockAgent.get('http://example.com');
		mockPool
			.intercept({ path: '/first.html', method: 'GET' })
			.reply(200, '<link rel="canonical" href="/target.html">', {
				headers: { 'content-type': 'text/html' },
			});
		mockPool
			.intercept({ path: '/second.html', method: 'GET' })
			.reply(200, '<a href="/target.html#late-missing">Late label</a>', {
				headers: { 'content-type': 'text/html' },
			})
			.delay(100);
		mockPool
			.intercept({ path: '/target.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });
		mockPool.intercept({ path: '/target.html', method: 'GET' }).reply(302, '', {
			headers: {
				'content-type': 'text/html',
				location: '/final.html',
			},
		});
		mockPool
			.intercept({ path: '/final.html', method: 'GET' })
			.reply(200, '<div id="different">Content</div>', {
				headers: { 'content-type': 'text/html' },
			});

		const results = await check({
			path: ['http://example.com/first.html', 'http://example.com/second.html'],
			checkFragments: true,
			linksToSkip: ['/never-skip$'],
		});

		const fragmentResult = results.links.find((result) =>
			result.url.endsWith('/target.html#late-missing'),
		);
		expect(fragmentResult?.state).toBe(LinkState.BROKEN);
		expect(fragmentResult?.displayText).toBe('Late label');
		expect(fragmentResult?.parent).toBe('http://example.com/second.html');
	});

	it('should tolerate unusable late fragment metadata responses', async () => {
		const mockPool = mockAgent.get('http://example.com');
		mockPool
			.intercept({ path: '/first.html', method: 'GET' })
			.reply(
				200,
				[
					'<link rel="canonical" href="/not-found.html">',
					'<link rel="canonical" href="/error.html">',
					'<link rel="canonical" href="/soft.html">',
				].join(''),
				{ headers: { 'content-type': 'text/html' } },
			);
		mockPool
			.intercept({ path: '/second.html', method: 'GET' })
			.reply(
				200,
				[
					'<a href="/not-found.html#missing">Not found</a>',
					'<a href="/error.html#missing">Error</a>',
					'<a href="/soft.html#missing">Soft 404</a>',
				].join(''),
				{ headers: { 'content-type': 'text/html' } },
			)
			.delay(100);
		for (const path of ['/not-found.html', '/error.html', '/soft.html']) {
			mockPool
				.intercept({ path, method: 'HEAD' })
				.reply(200, '', { headers: { 'content-type': 'text/html' } });
		}
		mockPool
			.intercept({ path: '/not-found.html', method: 'GET' })
			.reply(404, 'Not found', { headers: { 'content-type': 'text/html' } });
		mockPool
			.intercept({ path: '/error.html', method: 'GET' })
			.replyWithError(new Error('metadata fetch failed'));
		mockPool
			.intercept({ path: '/soft.html', method: 'GET' })
			.reply(
				200,
				'<meta name="robots" content="noindex,nofollow"><p>Not found</p>',
				{ headers: { 'content-type': 'text/html' } },
			);

		const results = await check({
			path: ['http://example.com/first.html', 'http://example.com/second.html'],
			checkFragments: true,
		});

		expect(results.passed).toBe(true);
		expect(results.links.some((result) => result.url.includes('#'))).toBe(
			false,
		);
	});

	it('should ignore fragment metadata that redirects to a skipped URL', async () => {
		const mockPool = mockAgent.get('http://example.com');
		mockPool
			.intercept({ path: '/source.html', method: 'GET' })
			.reply(200, '<a href="/target.html#missing">Target label</a>', {
				headers: { 'content-type': 'text/html' },
			});
		mockPool
			.intercept({ path: '/target.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });
		mockPool.intercept({ path: '/target.html', method: 'GET' }).reply(302, '', {
			headers: {
				'content-type': 'text/html',
				location: '/skip-me',
			},
		});

		const results = await check({
			path: 'http://example.com/source.html',
			checkFragments: true,
			linksToSkip: ['/skip-me$'],
		});

		const target = results.links.find(
			(result) => result.url === 'http://example.com/target.html',
		);
		expect(target?.state).toBe(LinkState.OK);
		expect(target?.displayText).toBe('Target label');
		expect(
			results.links.some((result) => result.url.endsWith('#missing')),
		).toBe(false);
	});

	it('should keep an early fragment metadata failure supplementary', async () => {
		const mockPool = mockAgent.get('http://example.com');
		mockPool
			.intercept({ path: '/source.html', method: 'GET' })
			.reply(200, '<a href="/target.html#missing">Target label</a>', {
				headers: { 'content-type': 'text/html' },
			});
		mockPool
			.intercept({ path: '/target.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });
		mockPool
			.intercept({ path: '/target.html', method: 'GET' })
			.reply(404, 'Not found', { headers: { 'content-type': 'text/html' } });

		const results = await check({
			path: 'http://example.com/source.html',
			checkFragments: true,
		});

		const target = results.links.find(
			(result) => result.url === 'http://example.com/target.html',
		);
		expect(results.passed).toBe(true);
		expect(target?.status).toBe(200);
		expect(target?.state).toBe(LinkState.OK);
		expect(
			results.links.some((result) => result.url.endsWith('#missing')),
		).toBe(false);
	});

	it('should validate a fragment whose target URL is rewritten', async () => {
		const mockPool = mockAgent.get('http://example.com');
		mockPool
			.intercept({ path: '/source.html', method: 'GET' })
			.reply(200, '<a href="/old.html#missing">Rewritten target</a>', {
				headers: { 'content-type': 'text/html' },
			});
		mockPool
			.intercept({ path: '/target.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });
		mockPool
			.intercept({ path: '/target.html', method: 'GET' })
			.reply(200, '<div id="different">Content</div>', {
				headers: { 'content-type': 'text/html' },
			});

		const results = await check({
			path: 'http://example.com/source.html',
			checkFragments: true,
			urlRewriteExpressions: [
				{ pattern: /\/old\.html$/, replacement: '/target.html' },
			],
		});

		const fragmentResult = results.links.find((result) =>
			result.url.endsWith('/target.html#missing'),
		);
		expect(fragmentResult?.state).toBe(LinkState.BROKEN);
		expect(fragmentResult?.displayText).toBe('Rewritten target');
	});

	it('should validate a late fragment whose target URL is rewritten', async () => {
		const mockPool = mockAgent.get('http://example.com');
		mockPool
			.intercept({ path: '/first.html', method: 'GET' })
			.reply(200, '<link rel="canonical" href="/old.html">', {
				headers: { 'content-type': 'text/html' },
			});
		mockPool
			.intercept({ path: '/second.html', method: 'GET' })
			.reply(200, '<a href="/old.html#late-missing">Late rewritten</a>', {
				headers: { 'content-type': 'text/html' },
			})
			.delay(100);
		mockPool
			.intercept({ path: '/target.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });
		mockPool
			.intercept({ path: '/target.html', method: 'GET' })
			.reply(200, '<div id="different">Content</div>', {
				headers: { 'content-type': 'text/html' },
			});

		const results = await check({
			path: ['http://example.com/first.html', 'http://example.com/second.html'],
			checkFragments: true,
			urlRewriteExpressions: [
				{ pattern: /\/old\.html$/, replacement: '/target.html' },
			],
		});

		const fragmentResult = results.links.find((result) =>
			result.url.endsWith('/target.html#late-missing'),
		);
		expect(fragmentResult?.state).toBe(LinkState.BROKEN);
		expect(fragmentResult?.displayText).toBe('Late rewritten');
	});

	it('should not validate fragments on a soft-404 page', async () => {
		const mockPool = mockAgent.get('http://example.com');
		mockPool
			.intercept({ path: '/source.html', method: 'GET' })
			.reply(200, '<a href="/target.html#missing">Target label</a>', {
				headers: { 'content-type': 'text/html' },
			});
		mockPool
			.intercept({ path: '/target.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });
		mockPool
			.intercept({ path: '/target.html', method: 'GET' })
			.reply(
				200,
				'<meta name="robots" content="noindex,nofollow"><p>Not found</p>',
				{ headers: { 'content-type': 'text/html' } },
			);

		const results = await check({
			path: 'http://example.com/source.html',
			checkFragments: true,
		});

		expect(results.passed).toBe(true);
		expect(
			results.links.some((result) => result.url.endsWith('#missing')),
		).toBe(false);
	});

	it('should not validate same-page fragments on a crawled soft-404 page', async () => {
		const mockPool = mockAgent.get('http://example.com');
		mockPool
			.intercept({ path: '/soft-root.html', method: 'GET' })
			.reply(
				200,
				'<meta name="robots" content="noindex,nofollow"><a href="#missing">Missing</a>',
				{ headers: { 'content-type': 'text/html' } },
			);

		const results = await check({
			path: 'http://example.com/soft-root.html',
			checkFragments: true,
		});

		expect(results.passed).toBe(true);
		expect(results.links.some((result) => result.url.includes('#'))).toBe(
			false,
		);
	});

	it('should not report a recursively crawled fragment twice', async () => {
		const mockPool = mockAgent.get('http://example.com');
		mockPool
			.intercept({ path: '/', method: 'GET' })
			.reply(200, '<a href="/target.html#missing">Missing section</a>', {
				headers: { 'content-type': 'text/html' },
			});
		mockPool
			.intercept({ path: '/target.html', method: 'GET' })
			.reply(200, '<div id="different">Content</div>', {
				headers: { 'content-type': 'text/html' },
			});

		const checker = new LinkChecker();
		const fragmentEvents: string[] = [];
		checker.on('link', (result) => {
			if (result.url.endsWith('/target.html#missing')) {
				fragmentEvents.push(result.url);
			}
		});
		const results = await checker.check({
			path: 'http://example.com/',
			checkFragments: true,
			recurse: true,
		});

		expect(
			results.links.filter((result) =>
				result.url.endsWith('/target.html#missing'),
			),
		).toHaveLength(1);
		expect(fragmentEvents).toHaveLength(1);
	});

	it('should reuse cached fragment validations for recursive self-links', async () => {
		const mockPool = mockAgent.get('http://example.com');
		mockPool
			.intercept({ path: '/', method: 'GET' })
			.reply(
				200,
				'<a href="/target.html#missing">Root missing</a><a href="/target.html#valid">Root valid</a>',
				{ headers: { 'content-type': 'text/html' } },
			);
		mockPool
			.intercept({ path: '/target.html', method: 'GET' })
			.reply(
				200,
				[
					'<div id="valid">Valid</div>',
					'<a href="#missing"><span></span></a>',
					'<a href="#missing">Self missing</a>',
					'<a href="#valid">Valid once</a>',
					'<a href="#valid">Valid twice</a>',
					'<div id="new-valid">Also valid</div>',
					'<a href="#new-valid">New valid</a>',
				].join(''),
				{ headers: { 'content-type': 'text/html' } },
			);

		const results = await check({
			path: 'http://example.com/',
			checkFragments: true,
			recurse: true,
		});

		const brokenFragments = results.links.filter(
			(result) =>
				result.url === 'http://example.com/target.html#missing' &&
				result.state === LinkState.BROKEN,
		);
		expect(brokenFragments).toHaveLength(2);
		expect(
			brokenFragments.map(({ displayText, parent }) => ({
				displayText,
				parent,
			})),
		).toEqual([
			{ displayText: 'Root missing', parent: 'http://example.com/' },
			{
				displayText: 'Self missing',
				parent: 'http://example.com/target.html',
			},
		]);
		expect(
			results.links.some(
				(result) =>
					result.url.endsWith('#valid') || result.url.endsWith('#new-valid'),
			),
		).toBe(false);
	});

	it('should retain fragment references registered before validation', async () => {
		const mockPool = mockAgent.get('http://example.com');
		for (const [path, label] of [
			['/first.html', 'First label'],
			['/second.html', 'Second label'],
		] as const) {
			mockPool
				.intercept({ path, method: 'GET' })
				.reply(200, `<a href="/target.html#missing">${label}</a>`, {
					headers: { 'content-type': 'text/html' },
				});
		}
		mockPool
			.intercept({ path: '/target.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });
		mockPool
			.intercept({ path: '/target.html', method: 'GET' })
			.reply(200, '<div id="different">Content</div>', {
				headers: { 'content-type': 'text/html' },
			});

		const results = await check({
			path: ['http://example.com/first.html', 'http://example.com/second.html'],
			checkFragments: true,
			concurrency: 1,
		});

		const fragmentResults = results.links.filter((result) =>
			result.url.endsWith('/target.html#missing'),
		);
		expect(fragmentResults).toHaveLength(2);
		expect(
			fragmentResults.map(({ displayText }) => displayText).sort(),
		).toEqual(['First label', 'Second label']);
	});

	it('should share preferred text across encoded-equivalent fragments', async () => {
		const mockPool = mockAgent.get('http://example.com');
		mockPool
			.intercept({ path: '/source.html', method: 'GET' })
			.reply(
				200,
				'<a href="/target.html#foo"><span></span></a><a href="/target.html#%66oo">Good label</a>',
				{ headers: { 'content-type': 'text/html' } },
			);
		mockPool
			.intercept({ path: '/target.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });
		mockPool
			.intercept({ path: '/target.html', method: 'GET' })
			.reply(200, '<div id="different">Content</div>', {
				headers: { 'content-type': 'text/html' },
			});

		const results = await check({
			path: 'http://example.com/source.html',
			checkFragments: true,
		});

		const fragmentResults = results.links.filter((result) =>
			result.url.endsWith('/target.html#foo'),
		);
		expect(fragmentResults).toHaveLength(1);
		expect(fragmentResults[0].displayText).toBe('Good label');
	});

	it('should isolate fragment metadata between LinkChecker checks', async () => {
		const mockPool = mockAgent.get('http://example.com');
		for (const [path, label] of [
			['/first.html', 'First label'],
			['/second.html', 'Second label'],
		] as const) {
			mockPool
				.intercept({ path, method: 'GET' })
				.reply(200, `<a href="/target.html#missing">${label}</a>`, {
					headers: { 'content-type': 'text/html' },
				});
			mockPool
				.intercept({ path: '/target.html', method: 'HEAD' })
				.reply(200, '', { headers: { 'content-type': 'text/html' } });
			mockPool
				.intercept({ path: '/target.html', method: 'GET' })
				.reply(200, '<div id="different">Content</div>', {
					headers: { 'content-type': 'text/html' },
				});
		}

		const checker = new LinkChecker();
		const first = await checker.check({
			path: 'http://example.com/first.html',
			checkFragments: true,
		});
		const second = await checker.check({
			path: 'http://example.com/second.html',
			checkFragments: true,
		});

		expect(
			first.links.find((result) => result.url.includes('#missing'))
				?.displayText,
		).toBe('First label');
		const secondFragment = second.links.find((result) =>
			result.url.includes('#missing'),
		);
		expect(secondFragment?.displayText).toBe('Second label');
		expect(secondFragment?.parent).toBe('http://example.com/second.html');
	});

	it('should not check fragments when checkFragments is disabled', async () => {
		const mockPool = mockAgent.get('http://example.com');

		// Mock the response - fragment doesn't exist but should not be checked
		mockPool
			.intercept({ path: '/page.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });

		const results = await check({
			path: 'test/fixtures/fragments-invalid',
			checkFragments: false,
		});

		// Should pass because fragments are not checked
		expect(results.passed).toBe(true);

		// Should only have the base URL check, not the fragment
		const fragmentResult = results.links.find((l) =>
			l.url.includes('#invalid-section'),
		);
		expect(fragmentResult).toBeUndefined();
	});

	it('should skip matching fragment validation but still check the URL', async () => {
		const mockPool = mockAgent.get('http://example.com');

		mockPool
			.intercept({ path: '/page.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });

		const results = await check({
			path: 'test/fixtures/fragments-invalid',
			checkFragments: true,
			fragmentsToSkip: ['^invalid-'],
		});

		expect(results.passed).toBe(true);
		expect(
			results.links.find((link) => link.url === 'http://example.com/page.html')
				?.state,
		).toBe(LinkState.OK);
		expect(
			results.links.find(
				(link) => link.url === 'http://example.com/page.html#invalid-section',
			)?.state,
		).toBe(LinkState.SKIPPED);
	});

	it('should pass decoded fragments and full URLs to a skip function', async () => {
		const received: Array<{ fragment: string; url: string }> = [];

		const results = await check({
			path: 'test/fixtures/fragments-client-state',
			checkFragments: true,
			fragmentsToSkip: async (fragment, url) => {
				received.push({ fragment, url });
				return true;
			},
		});

		expect(results.passed).toBe(true);
		const encodedState = received.find(
			({ fragment }) => fragment === 'encoded state',
		);
		expect(encodedState?.url).toMatch(/\/target\.html#encoded%20state$/);
		expect(
			results.links.filter((link) => link.state === LinkState.SKIPPED),
		).toHaveLength(6);
	});

	it('should skip common client-state fragments while retaining strict checks', async () => {
		const results = await check({
			path: 'test/fixtures/fragments-client-state',
			checkFragments: true,
			fragmentsToSkip: [
				'^code/',
				'^show-examples$',
				'^/',
				'^!/',
				'^encoded state$',
			],
		});

		expect(results.passed).toBe(false);
		expect(
			results.links.filter((link) => link.state === LinkState.SKIPPED),
		).toHaveLength(5);
		expect(
			results.links.find((link) => link.url.endsWith('#missing-section'))
				?.state,
		).toBe(LinkState.BROKEN);
		expect(
			results.links.find(
				(link) =>
					/[\\/]target\.html$/.test(link.url) && link.state === LinkState.OK,
			),
		).toBeDefined();
	});

	it('should handle URL-encoded fragments', async () => {
		const html = `
			<html>
				<body>
					<div id="my section">Content</div>
				</body>
			</html>
		`;
		const stream = Readable.from([html]);
		const fragments = await extractFragmentIds(stream);

		expect(fragments.has('my section')).toBe(true);
	});

	it('should handle multiple fragments pointing to the same page', async () => {
		const mockPool = mockAgent.get('http://example.com');

		mockPool
			.intercept({ path: '/page.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });

		mockPool
			.intercept({ path: '/page.html', method: 'GET' })
			.reply(
				200,
				'<html><body><div id="section-one">Content</div><div id="section-two">More</div></body></html>',
				{ headers: { 'content-type': 'text/html' } },
			);

		const results = await check({
			path: 'test/fixtures/fragments-multiple',
			checkFragments: true,
		});

		expect(results.passed).toBe(true);

		// Should have checked both fragments
		const baseUrlResult = results.links.find(
			(l) => l.url === 'http://example.com/page.html',
		);
		expect(baseUrlResult?.state).toBe(LinkState.OK);
	});

	it('should handle case-sensitive fragment matching', async () => {
		const html = `
			<html>
				<body>
					<div id="MySection">Content</div>
				</body>
			</html>
		`;
		const stream = Readable.from([html]);
		const fragments = await extractFragmentIds(stream);

		// IDs are case-sensitive in HTML
		expect(fragments.has('MySection')).toBe(true);
		expect(fragments.has('mysection')).toBe(false);
	});

	it('should skip fragment validation for non-HTML content', async () => {
		const mockPool = mockAgent.get('http://example.com');

		mockPool
			.intercept({ path: '/image.png', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'image/png' } });

		const results = await check({
			path: 'test/fixtures/fragments-non-html',
			checkFragments: true,
		});

		// Should pass - fragments are only checked for HTML
		expect(results.passed).toBe(true);
	});

	it('should handle empty fragments gracefully', async () => {
		const mockPool = mockAgent.get('http://example.com');

		mockPool
			.intercept({ path: '/page.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });

		const results = await check({
			path: 'test/fixtures/fragments-empty',
			checkFragments: true,
		});

		// Empty fragments (#) should not be validated
		expect(results.passed).toBe(true);
	});

	it('should emit events for broken fragments', async () => {
		const mockPool = mockAgent.get('http://example.com');

		mockPool
			.intercept({ path: '/page.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });

		mockPool
			.intercept({ path: '/page.html', method: 'GET' })
			.reply(200, '<html><body><div id="exists">Content</div></body></html>', {
				headers: { 'content-type': 'text/html' },
			});

		const checker = new LinkChecker();
		const linkEvents: Array<{ url: string; state: LinkState }> = [];

		checker.on('link', (result) => {
			linkEvents.push({ url: result.url, state: result.state });
		});

		await checker.check({
			path: 'test/fixtures/fragments-invalid',
			checkFragments: true,
		});

		// Should have emitted an event for the broken fragment
		const brokenFragmentEvent = linkEvents.find(
			(e) => e.url.includes('#invalid-section') && e.state === LinkState.BROKEN,
		);
		expect(brokenFragmentEvent).toBeDefined();
	});

	it('should work with local file server (Node.js Readable streams)', async () => {
		// This test uses the built-in local file server which returns Node.js Readable streams
		// instead of Web ReadableStreams, testing a different code path
		const results = await check({
			path: 'test/fixtures/fragments-demo',
			checkFragments: true,
			recurse: true,
		});

		// Should fail because nonexistent-section doesn't exist
		expect(results.passed).toBe(false);

		// Find the broken fragment link
		const brokenFragment = results.links.find((l) =>
			l.url.includes('#nonexistent-section'),
		);
		expect(brokenFragment?.state).toBe(LinkState.BROKEN);
		expect(brokenFragment?.displayText).toBe(
			'Link to nonexistent section (should fail)',
		);
		expect(brokenFragment?.failureDetails?.[0]).toBeInstanceOf(Error);
		expect((brokenFragment?.failureDetails?.[0] as Error).message).toContain(
			"Fragment identifier '#nonexistent-section' not found on page",
		);

		// Valid fragments should pass
		const _validFragment1 = results.links.find((l) =>
			l.url.includes('#valid-section'),
		);
		const _validFragment2 = results.links.find((l) =>
			l.url.includes('#another-section'),
		);

		// These fragments should not be marked as broken (they're valid)
		// Note: They won't be in results as separate OK links unless they failed
		// The absence of them in the broken list is the passing condition
		expect(
			results.links.filter(
				(l) =>
					(l.url.includes('#valid-section') ||
						l.url.includes('#another-section')) &&
					l.state === LinkState.BROKEN,
			),
		).toHaveLength(0);
	});

	it('should validate fragments in markdown files with GitHub-style heading IDs', async () => {
		// This test verifies that markdown headings get proper id attributes
		// e.g., ## Authoring -> <h2 id="authoring">Authoring</h2>
		const results = await check({
			path: 'test/fixtures/fragments-markdown',
			markdown: true,
			checkFragments: true,
		});

		// Should pass - markdown headings generate lowercase hyphenated IDs
		expect(results.passed).toBe(true);

		// Both fragment links should be valid
		expect(
			results.links.filter(
				(l) =>
					(l.url.includes('#authoring') || l.url.includes('#examples')) &&
					l.state === LinkState.BROKEN,
			),
		).toHaveLength(0);
	});

	it('should mark invalid markdown fragments as broken', async () => {
		const results = await check({
			path: 'test/fixtures/fragments-markdown-invalid',
			markdown: true,
			checkFragments: true,
		});

		// Should fail - fragment doesn't exist
		expect(results.passed).toBe(false);

		// Find the broken fragment link
		const fragmentResult = results.links.find((l) =>
			l.url.includes('#nonexistent'),
		);
		expect(fragmentResult?.state).toBe(LinkState.BROKEN);
		expect(fragmentResult?.failureDetails?.[0]).toBeInstanceOf(Error);
		expect((fragmentResult?.failureDetails?.[0] as Error).message).toContain(
			"Fragment identifier '#nonexistent' not found on page",
		);
	});

	it('should recognize the top target while checking local Markdown', async () => {
		const results = await check({
			path: 'test/fixtures/fragments-markdown-top',
			markdown: true,
			checkFragments: true,
		});

		expect(results.passed).toBe(false);
		expect(
			results.links.find(
				(link) => link.url.endsWith('#top') && link.state === LinkState.BROKEN,
			),
		).toBeUndefined();
		expect(
			results.links.find(
				(link) =>
					link.url.endsWith('#missing') && link.state === LinkState.BROKEN,
			),
		).toBeDefined();
	});

	it('should validate same-page fragment links (issue #770)', async () => {
		const results = await check({
			path: 'test/fixtures/fragments-same-page',
			checkFragments: true,
		});

		// Should fail because nonexistent-section doesn't exist
		expect(results.passed).toBe(false);

		// Find the broken same-page fragment link
		const brokenFragment = results.links.find((l) =>
			l.url.includes('#nonexistent-section'),
		);
		expect(brokenFragment?.state).toBe(LinkState.BROKEN);
		expect(brokenFragment?.displayText).toBe('Link to nonexistent section');
		expect(brokenFragment?.failureDetails?.[0]).toBeInstanceOf(Error);
		expect((brokenFragment?.failureDetails?.[0] as Error).message).toContain(
			"Fragment identifier '#nonexistent-section' not found on page",
		);

		// Valid same-page fragments should not be reported as broken
		const validFragments = results.links.filter(
			(l) =>
				(l.url.includes('#valid-section') ||
					l.url.includes('#another-section')) &&
				l.state === LinkState.BROKEN,
		);
		expect(validFragments).toHaveLength(0);
	});

	it('should treat top and its ASCII case variants as valid document targets', async () => {
		const mockPool = mockAgent.get('http://example.com');

		mockPool
			.intercept({ path: '/target.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });

		mockPool
			.intercept({ path: '/target.html', method: 'GET' })
			.reply(200, '<html><body><p>No fragment targets</p></body></html>', {
				headers: { 'content-type': 'text/html' },
			});

		const results = await check({
			path: 'test/fixtures/fragments-top',
			checkFragments: true,
		});

		expect(results.passed).toBe(false);
		expect(
			results.links.filter(
				(link) =>
					/#(?:top|TOP|ToP)$/i.test(link.url) &&
					link.state === LinkState.BROKEN,
			),
		).toHaveLength(0);
		expect(
			results.links.find(
				(link) =>
					link.url === 'http://example.com/target.html#missing' &&
					link.state === LinkState.BROKEN,
			),
		).toBeDefined();
		expect(
			results.links.find(
				(link) =>
					link.url.endsWith('#missing id') && link.state === LinkState.BROKEN,
			),
		).toBeDefined();
		expect(
			results.links.find(
				(link) =>
					link.url.endsWith('#ordinary id') && link.state === LinkState.BROKEN,
			),
		).toBeUndefined();
	});

	it('should apply fragment skip rules before recognizing the top target', async () => {
		const mockPool = mockAgent.get('http://example.com');

		mockPool
			.intercept({ path: '/target.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });

		mockPool
			.intercept({ path: '/target.html', method: 'GET' })
			.reply(200, '<html><body><p>No fragment targets</p></body></html>', {
				headers: { 'content-type': 'text/html' },
			});

		const results = await check({
			path: 'test/fixtures/fragments-top',
			checkFragments: true,
			fragmentsToSkip: ['^TOP$'],
		});

		expect(
			results.links.find(
				(link) => link.url.endsWith('#TOP') && link.state === LinkState.SKIPPED,
			),
		).toBeDefined();
	});

	it('should validate GitHub-style permalink anchors', async () => {
		// GitHub adds permalink anchors with both id and href attributes:
		// <a id="user-content-section-anchor" href="#section">
		// The href fragment should be considered valid even if the actual
		// element has a prefixed id like "user-content-section"
		const results = await check({
			path: 'test/fixtures/fragments-github-style',
			checkFragments: true,
		});

		// Should fail because only #nonexistent doesn't exist
		expect(results.passed).toBe(false);

		// Valid GitHub-style fragments should pass
		const validFragmentLinks = results.links.filter(
			(l) =>
				(l.url.includes('#section-one') || l.url.includes('#section-two')) &&
				l.state === LinkState.BROKEN,
		);
		expect(validFragmentLinks).toHaveLength(0);

		// Invalid fragment should fail
		const brokenFragment = results.links.find((l) =>
			l.url.includes('#nonexistent'),
		);
		expect(brokenFragment?.state).toBe(LinkState.BROKEN);
		expect(brokenFragment?.failureDetails?.[0]).toBeInstanceOf(Error);
		expect((brokenFragment?.failureDetails?.[0] as Error).message).toContain(
			"Fragment identifier '#nonexistent' not found on page",
		);
	});

	describe('validateFragments', () => {
		it('should validate fragments against HTML content', async () => {
			const html = `
				<html>
					<body>
						<div id="exists">Content</div>
						<div id="another">More</div>
					</body>
				</html>
			`;
			const htmlContent = Buffer.from(html);
			const fragmentsToCheck = new Set(['exists', 'another', 'missing']);

			const results = await validateFragments(htmlContent, fragmentsToCheck);

			expect(results).toHaveLength(3);
			expect(results.find((r) => r.fragment === 'exists')?.isValid).toBe(true);
			expect(results.find((r) => r.fragment === 'another')?.isValid).toBe(true);
			expect(results.find((r) => r.fragment === 'missing')?.isValid).toBe(
				false,
			);
		});

		it('should return empty array when no fragments to validate', async () => {
			const html = '<html><body><div id="test">Content</div></body></html>';
			const htmlContent = Buffer.from(html);
			const fragmentsToCheck = new Set<string>();

			const results = await validateFragments(htmlContent, fragmentsToCheck);

			expect(results).toHaveLength(0);
		});

		it('should only recognize ASCII case variants of top as special', async () => {
			const htmlContent = Buffer.from(`
				<html>
					<body>
						<div id="ordinary-id">Content</div>
						<a name="legacy-anchor">Legacy target</a>
					</body>
				</html>
			`);
			const fragmentsToCheck = new Set([
				'top',
				'TOP',
				'ToP',
				'ordinary-id',
				'legacy-anchor',
				'top ',
				'töp',
				'missing',
			]);

			const results = await validateFragments(htmlContent, fragmentsToCheck);
			const validity = Object.fromEntries(
				results.map(({ fragment, isValid }) => [fragment, isValid]),
			);

			expect(validity).toEqual({
				top: true,
				TOP: true,
				ToP: true,
				'ordinary-id': true,
				'legacy-anchor': true,
				'top ': false,
				töp: false,
				missing: false,
			});
		});
	});
});
