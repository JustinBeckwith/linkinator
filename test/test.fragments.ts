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
	});
});
