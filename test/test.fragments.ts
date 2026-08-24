import { Readable } from 'node:stream';
import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateFragmentsAgainstIds } from '../src/fragments.js';
import { check, LinkChecker, LinkState } from '../src/index.js';
import { extractFragmentIds } from '../src/links.js';

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

	it('should validate fragments discovered after the target was checked', async () => {
		// The target is checked first as a seed, so the fragments that page.html
		// contributes for it arrive after it has already been fetched.
		const results = await check({
			path: [
				'test/fixtures/fragments-late-discovery/target.html',
				'test/fixtures/fragments-late-discovery/page.html',
			],
			checkFragments: true,
			concurrency: 1,
		});

		expect(results.passed).toBe(false);

		const brokenFragment = results.links.find((l) =>
			l.url.includes('#missing'),
		);
		expect(brokenFragment?.state).toBe(LinkState.BROKEN);
		expect(brokenFragment?.failureDetails?.[0]).toBeInstanceOf(Error);
		expect((brokenFragment?.failureDetails?.[0] as Error).message).toContain(
			"Fragment identifier '#missing' not found on page",
		);

		// The fragment that does exist on the target must not be reported.
		const validFragments = results.links.filter(
			(l) => l.url.includes('#exists') && l.state === LinkState.BROKEN,
		);
		expect(validFragments).toHaveLength(0);
	});

	it('should report a fragment whose target cannot be requested again', async () => {
		const mockPool = mockAgent.get('http://example.com');

		// The crawl only ever sees a HEAD for the target, so the fragment
		// ref.html adds can only be answered by requesting it again.
		mockPool
			.intercept({ path: '/target.html', method: 'HEAD' })
			.reply(200, '', { headers: { 'content-type': 'text/html' } });

		mockPool
			.intercept({ path: '/target.html', method: 'GET' })
			.reply(500, 'server error', {
				headers: { 'content-type': 'text/html' },
			});

		const checker = new LinkChecker();
		const unverified: string[] = [];
		checker.on('fragmentUnverified', (details) => {
			unverified.push(`${details.url}#${details.fragment}`);
		});

		const results = await checker.check({
			path: 'test/fixtures/fragments-late-remote',
			recurse: true,
			checkFragments: true,
			concurrency: 1,
		});

		// A fragment nobody could check must not be reported as fine.
		expect(results.passed).toBe(false);

		const fragmentResult = results.links.find((l) =>
			l.url.includes('#missing'),
		);
		expect(fragmentResult?.state).toBe(LinkState.BROKEN);
		expect((fragmentResult?.failureDetails?.[0] as Error).message).toContain(
			"Fragment identifier '#missing' could not be verified",
		);
		expect(unverified).toEqual(['http://example.com/target.html#missing']);
	});

	it('should answer fragments on an accepted non-2xx target, referrer first', async () => {
		const mockPool = mockAgent.get('http://example.com');

		mockPool
			.intercept({ path: '/target.html', method: 'HEAD' })
			.reply(403, '', { headers: { 'content-type': 'text/html' } })
			.persist();

		mockPool
			.intercept({ path: '/target.html', method: 'GET' })
			.reply(403, '<html><body><div id="exists">Content</div></body></html>', {
				headers: { 'content-type': 'text/html' },
			})
			.persist();

		const results = await check({
			path: 'test/fixtures/fragments-late-remote/ref.html',
			statusCodes: { '403': 'ok' },
			checkFragments: true,
			concurrency: 1,
		});

		expect(results.passed).toBe(false);

		const fragmentResult = results.links.find((l) =>
			l.url.includes('#missing'),
		);
		expect(fragmentResult?.state).toBe(LinkState.BROKEN);
		expect((fragmentResult?.failureDetails?.[0] as Error).message).toContain(
			"Fragment identifier '#missing' not found on page",
		);
	});

	it('should answer fragments on an accepted non-2xx target, target first', async () => {
		const mockPool = mockAgent.get('http://example.com');

		// The target is checked before any fragment for it is known, so the
		// deferred pass has to accept the 403 the same way the crawl did.
		mockPool
			.intercept({ path: '/target.html', method: 'HEAD' })
			.reply(403, '', { headers: { 'content-type': 'text/html' } })
			.persist();

		mockPool
			.intercept({ path: '/target.html', method: 'GET' })
			.reply(403, '<html><body><div id="exists">Content</div></body></html>', {
				headers: { 'content-type': 'text/html' },
			})
			.persist();

		const results = await check({
			path: 'test/fixtures/fragments-late-remote',
			recurse: true,
			statusCodes: { '403': 'ok' },
			checkFragments: true,
			concurrency: 1,
		});

		expect(results.passed).toBe(false);

		const fragmentResult = results.links.find((l) =>
			l.url.includes('#missing'),
		);
		expect(fragmentResult?.state).toBe(LinkState.BROKEN);
		expect((fragmentResult?.failureDetails?.[0] as Error).message).toContain(
			"Fragment identifier '#missing' not found on page",
		);
	});

	it('should not request a crawled page again to answer late fragments', async () => {
		const mockPool = mockAgent.get('http://example.com');

		// Exactly one request per page. A second request for the target would
		// find no interceptor and surface as an unverified fragment.
		mockPool.intercept({ path: '/', method: 'GET' }).reply(
			200,
			`<html><body>
				<a href="/target.html">Target</a>
				<a href="/ref.html">Referring page</a>
			</body></html>`,
			{ headers: { 'content-type': 'text/html' } },
		);

		mockPool
			.intercept({ path: '/target.html', method: 'GET' })
			.reply(200, '<html><body><div id="exists">Content</div></body></html>', {
				headers: { 'content-type': 'text/html' },
			});

		mockPool
			.intercept({ path: '/ref.html', method: 'GET' })
			.reply(
				200,
				'<html><body><a href="/target.html#missing">Missing</a></body></html>',
				{ headers: { 'content-type': 'text/html' } },
			);

		const results = await check({
			path: 'http://example.com/',
			recurse: true,
			checkFragments: true,
			concurrency: 1,
		});

		expect(results.passed).toBe(false);

		const brokenFragments = results.links.filter((l) =>
			l.url.includes('#missing'),
		);
		expect(brokenFragments).toHaveLength(1);
		expect((brokenFragments[0].failureDetails?.[0] as Error).message).toContain(
			"Fragment identifier '#missing' not found on page",
		);
	});

	it('should validate fragments on a rewritten target, referrer first', async () => {
		const results = await check({
			path: 'test/fixtures/fragments-rewrite/ref.html',
			urlRewriteExpressions: [
				{ pattern: /old-target\.html/, replacement: 'new-target.html' },
			],
			checkFragments: true,
			concurrency: 1,
		});

		expect(results.passed).toBe(false);

		const brokenFragment = results.links.find((l) =>
			l.url.includes('#missing'),
		);
		expect(brokenFragment?.state).toBe(LinkState.BROKEN);
		expect(brokenFragment?.url).toContain('new-target.html');

		const validFragments = results.links.filter(
			(l) => l.url.includes('#exists') && l.state === LinkState.BROKEN,
		);
		expect(validFragments).toHaveLength(0);
	});

	it('should validate fragments on a rewritten target, target first', async () => {
		// The rewritten target is seeded first, so the fragments that ref.html
		// contributes for it arrive after it has already been fetched.
		const results = await check({
			path: [
				'test/fixtures/fragments-rewrite/new-target.html',
				'test/fixtures/fragments-rewrite/ref.html',
			],
			urlRewriteExpressions: [
				{ pattern: /old-target\.html/, replacement: 'new-target.html' },
			],
			checkFragments: true,
			concurrency: 1,
		});

		expect(results.passed).toBe(false);

		const brokenFragment = results.links.find((l) =>
			l.url.includes('#missing'),
		);
		expect(brokenFragment?.state).toBe(LinkState.BROKEN);
		expect(brokenFragment?.parent).toContain('ref.html');
	});

	it('should validate late fragments found while recursing', async () => {
		// The crawl reaches a.html from index.html first; b.html links
		// a.html#missing only afterwards.
		const results = await check({
			path: 'test/fixtures/fragments-late-recurse',
			recurse: true,
			checkFragments: true,
			concurrency: 1,
		});

		expect(results.passed).toBe(false);

		const brokenFragment = results.links.find((l) =>
			l.url.includes('#missing'),
		);
		expect(brokenFragment?.state).toBe(LinkState.BROKEN);
		expect((brokenFragment?.failureDetails?.[0] as Error).message).toContain(
			"Fragment identifier '#missing' not found on page",
		);
	});

	it('should report a broken fragment for the page that links it', async () => {
		const results = await check({
			path: [
				'test/fixtures/fragments-late-discovery/target.html',
				'test/fixtures/fragments-late-discovery/page.html',
			],
			checkFragments: true,
			concurrency: 1,
		});

		const brokenFragment = results.links.find((l) =>
			l.url.includes('#missing'),
		);
		expect(brokenFragment?.parent).toContain('page.html');
	});

	it('should report a broken fragment once per referring page', async () => {
		const results = await check({
			path: [
				'test/fixtures/fragments-multiple-parents/pageA.html',
				'test/fixtures/fragments-multiple-parents/pageB.html',
			],
			checkFragments: true,
			concurrency: 1,
		});

		expect(results.passed).toBe(false);

		const brokenFragments = results.links.filter(
			(l) => l.url.includes('#missing') && l.state === LinkState.BROKEN,
		);
		expect(brokenFragments).toHaveLength(2);

		const parents = brokenFragments.map((l) => l.parent ?? '').sort();
		expect(parents[0]).toContain('pageA.html');
		expect(parents[1]).toContain('pageB.html');
	});

	describe('validateFragmentsAgainstIds', () => {
		it('should validate fragments against the ids a page offers', async () => {
			const html = `
				<html>
					<body>
						<div id="exists">Content</div>
						<div id="another">More</div>
					</body>
				</html>
			`;
			const validIds = await extractFragmentIds(Readable.from([html]));
			const fragmentsToCheck = new Set(['exists', 'another', 'missing']);

			const results = validateFragmentsAgainstIds(validIds, fragmentsToCheck);

			expect(results).toHaveLength(3);
			expect(results.find((r) => r.fragment === 'exists')?.isValid).toBe(true);
			expect(results.find((r) => r.fragment === 'another')?.isValid).toBe(true);
			expect(results.find((r) => r.fragment === 'missing')?.isValid).toBe(
				false,
			);
		});

		it('should return empty array when no fragments to validate', async () => {
			const html = '<html><body><div id="test">Content</div></body></html>';
			const validIds = await extractFragmentIds(Readable.from([html]));

			const results = validateFragmentsAgainstIds(validIds, new Set<string>());

			expect(results).toHaveLength(0);
		});

		it('should only recognize ASCII case variants of top as special', async () => {
			const html = `
				<html>
					<body>
						<div id="ordinary-id">Content</div>
						<a name="legacy-anchor">Legacy target</a>
					</body>
				</html>
			`;
			const validIds = await extractFragmentIds(Readable.from([html]));
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

			const results = validateFragmentsAgainstIds(validIds, fragmentsToCheck);
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
