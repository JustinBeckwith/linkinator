import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from 'undici';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LinkChecker, LinkState } from '../src/index.js';

describe('status code configuration', () => {
	let mockAgent: MockAgent;
	let originalDispatcher: ReturnType<typeof getGlobalDispatcher>;

	beforeEach(() => {
		originalDispatcher = getGlobalDispatcher();
		mockAgent = new MockAgent();
		mockAgent.disableNetConnect();
		mockAgent.enableNetConnect((host) => {
			return host.includes('localhost') || host.includes('127.0.0.1');
		});
		setGlobalDispatcher(mockAgent);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		vi.unstubAllEnvs();
		mockAgent.assertNoPendingInterceptors();
		await mockAgent.close();
		setGlobalDispatcher(originalDispatcher);
	});

	it('should treat 403 as OK when configured with "ok" action', async () => {
		const mockPool = mockAgent.get('https://example.com');
		mockPool.intercept({ path: '/forbidden', method: 'HEAD' }).reply(403, '');

		const checker = new LinkChecker();
		const results = await checker.check({
			path: 'test/fixtures/status-codes/403.html',
			statusCodes: { '403': 'ok' },
		});

		const forbiddenLink = results.links.find((l) =>
			l.url.includes('/forbidden'),
		);
		expect(forbiddenLink?.state).toBe(LinkState.OK);
		expect(forbiddenLink?.status).toBe(403);
		expect(results.passed).toBe(true);
	});

	it('should treat 403 as warning when configured with "warn" action', async () => {
		const mockPool = mockAgent.get('https://example.com');
		mockPool.intercept({ path: '/forbidden', method: 'HEAD' }).reply(403, '');

		const checker = new LinkChecker();
		const warnings: Array<{ url: string; status: number }> = [];
		checker.on('statusCodeWarning', (info) => {
			warnings.push(info);
		});

		const results = await checker.check({
			path: 'test/fixtures/status-codes/403.html',
			statusCodes: { '403': 'warn' },
		});

		const forbiddenLink = results.links.find((l) =>
			l.url.includes('/forbidden'),
		);
		expect(forbiddenLink?.state).toBe(LinkState.OK);
		expect(forbiddenLink?.status).toBe(403);
		expect(results.passed).toBe(true);
		expect(warnings.length).toBe(1);
		expect(warnings[0].status).toBe(403);
	});

	it('should skip 404 when configured with "skip" action', async () => {
		const mockPool = mockAgent.get('https://example.com');
		mockPool.intercept({ path: '/notfound', method: 'HEAD' }).reply(404, '');

		const checker = new LinkChecker();
		const results = await checker.check({
			path: 'test/fixtures/status-codes/404.html',
			statusCodes: { '404': 'skip' },
		});

		const notFoundLink = results.links.find((l) => l.url.includes('/notfound'));
		expect(notFoundLink?.state).toBe(LinkState.SKIPPED);
		expect(notFoundLink?.status).toBe(404);
		expect(results.passed).toBe(true);
	});

	it('should force 200 to error when configured with "error" action', async () => {
		const mockPool = mockAgent.get('https://example.com');
		mockPool.intercept({ path: '/success', method: 'HEAD' }).reply(200, '');

		const checker = new LinkChecker();
		const results = await checker.check({
			path: 'test/fixtures/status-codes/200.html',
			statusCodes: { '200': 'error' },
		});

		const successLink = results.links.find((l) => l.url.includes('/success'));
		expect(successLink?.state).toBe(LinkState.BROKEN);
		expect(successLink?.status).toBe(200);
		expect(results.passed).toBe(false);
	});

	it('should match status code patterns like "4xx"', async () => {
		const mockPool = mockAgent.get('https://example.com');
		mockPool.intercept({ path: '/forbidden', method: 'HEAD' }).reply(403, '');
		mockPool.intercept({ path: '/notfound', method: 'HEAD' }).reply(404, '');
		mockPool
			.intercept({ path: '/teapot', method: 'HEAD' })
			.reply(418, "I'm a teapot");

		const checker = new LinkChecker();
		const results = await checker.check({
			path: 'test/fixtures/status-codes/pattern.html',
			statusCodes: { '4xx': 'warn' },
		});

		const forbiddenLink = results.links.find((l) =>
			l.url.includes('/forbidden'),
		);
		const notFoundLink = results.links.find((l) => l.url.includes('/notfound'));
		const teapotLink = results.links.find((l) => l.url.includes('/teapot'));

		expect(forbiddenLink?.state).toBe(LinkState.OK);
		expect(notFoundLink?.state).toBe(LinkState.OK);
		expect(teapotLink?.state).toBe(LinkState.OK);
		expect(results.passed).toBe(true);
	});

	it('should match status code patterns like "5xx"', async () => {
		const mockPool = mockAgent.get('https://example.com');
		mockPool.intercept({ path: '/error', method: 'HEAD' }).reply(500, '');
		mockPool.intercept({ path: '/unavailable', method: 'HEAD' }).reply(503, '');

		const checker = new LinkChecker();
		const results = await checker.check({
			path: 'test/fixtures/status-codes/5xx.html',
			statusCodes: { '5xx': 'skip' },
		});

		const errorLink = results.links.find((l) => l.url.includes('/error'));
		const unavailableLink = results.links.find((l) =>
			l.url.includes('/unavailable'),
		);

		expect(errorLink?.state).toBe(LinkState.SKIPPED);
		expect(unavailableLink?.state).toBe(LinkState.SKIPPED);
		expect(results.passed).toBe(true);
	});

	it('should prioritize exact matches over patterns', async () => {
		const mockPool = mockAgent.get('https://example.com');
		mockPool.intercept({ path: '/forbidden', method: 'HEAD' }).reply(403, '');
		mockPool.intercept({ path: '/notfound', method: 'HEAD' }).reply(404, '');
		mockPool
			.intercept({ path: '/teapot', method: 'HEAD' })
			.reply(418, "I'm a teapot");

		const checker = new LinkChecker();
		const results = await checker.check({
			path: 'test/fixtures/status-codes/pattern.html',
			statusCodes: {
				'4xx': 'warn', // General pattern
				'404': 'skip', // Specific override
			},
		});

		const forbiddenLink = results.links.find((l) =>
			l.url.includes('/forbidden'),
		);
		const notFoundLink = results.links.find((l) => l.url.includes('/notfound'));

		// 403 should match 4xx pattern (warn = OK)
		expect(forbiddenLink?.state).toBe(LinkState.OK);
		// 404 should match exact rule (skip)
		expect(notFoundLink?.state).toBe(LinkState.SKIPPED);
		expect(results.passed).toBe(true);
	});

	it('should not interfere with default behavior when no configuration', async () => {
		const mockPool = mockAgent.get('https://example.com');
		mockPool.intercept({ path: '/success', method: 'HEAD' }).reply(200, '');
		mockPool.intercept({ path: '/notfound', method: 'HEAD' }).reply(404, '');

		const checker = new LinkChecker();
		const results = await checker.check({
			path: 'test/fixtures/status-codes/default.html',
		});

		const successLink = results.links.find((l) => l.url.includes('/success'));
		const notFoundLink = results.links.find((l) => l.url.includes('/notfound'));

		expect(successLink?.state).toBe(LinkState.OK);
		expect(notFoundLink?.state).toBe(LinkState.BROKEN);
		expect(results.passed).toBe(false);
	});
});
