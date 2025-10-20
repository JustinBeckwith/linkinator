import { getGlobalDispatcher, MockAgent, setGlobalDispatcher } from 'undici';
import { afterEach, assert, beforeEach, describe, it, vi } from 'vitest';
import { check, LinkChecker } from '../src/index.js';

describe('retries', () => {
	let mockAgent: MockAgent;
	let originalDispatcher: ReturnType<typeof getGlobalDispatcher>;

	beforeEach(() => {
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
		vi.useRealTimers();
		// Assert all mocked requests were called (equivalent to nock's scope.done())
		mockAgent.assertNoPendingInterceptors();
		await mockAgent.close();
		setGlobalDispatcher(originalDispatcher);
	});

	it('should handle 429s with invalid retry-after headers', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/', method: 'GET' }).reply(429, '', {
			headers: { 'retry-after': 'totally-not-valid' },
		});
		const results = await check({
			path: 'test/fixtures/basic',
			retry: true,
		});
		assert.ok(!results.passed);
	});

	it('should retry 429s with second based header', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/', method: 'GET' }).reply(429, '', {
			headers: { 'retry-after': '10' },
		});
		mockPool.intercept({ path: '/', method: 'GET' }).reply(200, '');

		const { promise, resolve } = invertedPromise();
		const checker = new LinkChecker().on('retry', resolve);
		const clock = vi.useFakeTimers({ shouldAdvanceTime: true });
		const checkPromise = checker.check({
			path: 'test/fixtures/basic',
			retry: true,
		});

		await promise;
		await clock.advanceTimersByTime(10_000);
		const results = await checkPromise;
		assert.ok(results.passed);
	});

	it('should retry 429s after failed HEAD', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/', method: 'HEAD' }).reply(405, '');
		mockPool.intercept({ path: '/', method: 'GET' }).reply(429, '', {
			headers: { 'retry-after': '10' },
		});
		mockPool.intercept({ path: '/', method: 'GET' }).reply(200, '');

		const { promise, resolve } = invertedPromise();
		const checker = new LinkChecker().on('retry', resolve);
		const clock = vi.useFakeTimers({ shouldAdvanceTime: true });
		const checkPromise = checker.check({
			path: 'test/fixtures/basic',
			retry: true,
		});
		await promise;
		await clock.advanceTimersByTime(10_000);
		const results = await checkPromise;
		assert.ok(results.passed);
	});

	it('should retry 429s with date based header', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/', method: 'GET' }).reply(429, '', {
			headers: { 'retry-after': '1970-01-01T00:00:10.000Z' },
		});
		mockPool.intercept({ path: '/', method: 'GET' }).reply(200, '');

		const { promise, resolve } = invertedPromise();
		const checker = new LinkChecker().on('retry', resolve);
		const clock = vi.useFakeTimers({ shouldAdvanceTime: true });
		const checkPromise = checker.check({
			path: 'test/fixtures/basic',
			retry: true,
		});
		await promise;
		await clock.advanceTimersByTime(10_000);
		const results = await checkPromise;
		assert.ok(results.passed);
	});

	it('should detect requests to wait on the same host', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/1', method: 'GET' }).reply(429, '', {
			headers: { 'retry-after': '3' },
		});
		mockPool.intercept({ path: '/1', method: 'GET' }).reply(() => {
			assert.ok(Date.now() >= 3000);
			return { statusCode: 200, data: '', responseOptions: {} };
		});
		mockPool.intercept({ path: '/2', method: 'GET' }).reply(() => {
			assert.ok(Date.now() >= 3000);
			return { statusCode: 200, data: '', responseOptions: {} };
		});
		mockPool.intercept({ path: '/3', method: 'GET' }).reply(429, '', {
			headers: { 'retry-after': '3' },
		});
		mockPool.intercept({ path: '/3', method: 'GET' }).reply(() => {
			assert.ok(Date.now() >= 3000);
			return { statusCode: 200, data: '', responseOptions: {} };
		});

		const { promise, resolve } = invertedPromise();
		const checker = new LinkChecker().on('retry', resolve);
		const clock = vi.useFakeTimers({ shouldAdvanceTime: true });
		const checkPromise = checker.check({
			path: 'test/fixtures/retry',
			recurse: true,
			retry: true,
		});
		await promise;
		await clock.advanceTimersByTime(3000);
		const results = await checkPromise;
		assert.ok(results.passed);
	});

	it('should increase timeout for followup requests to a host', async () => {
		const mockPool = mockAgent.get('http://example.invalid');
		mockPool.intercept({ path: '/1', method: 'GET' }).reply(429, '', {
			headers: { 'retry-after': '3' },
		});
		mockPool.intercept({ path: '/1', method: 'GET' }).reply(() => {
			// Even though the header said to wait 3 seconds, we are checking to
			// make sure the /3 route reset it to 9 seconds here. This is common
			// when a flood of requests come through and the retry-after gets
			// extended.
			assert.ok(Date.now() >= 9000);
			return { statusCode: 200, data: '', responseOptions: {} };
		});
		mockPool.intercept({ path: '/2', method: 'GET' }).reply(() => {
			assert.ok(Date.now() >= 9000);
			return { statusCode: 200, data: '', responseOptions: {} };
		});
		mockPool.intercept({ path: '/3', method: 'GET' }).reply(429, '', {
			headers: { 'retry-after': '9' },
		});
		mockPool.intercept({ path: '/3', method: 'GET' }).reply(() => {
			assert.ok(Date.now() >= 9000);
			return { statusCode: 200, data: '', responseOptions: {} };
		});

		const { promise: p1, resolve: r1 } = invertedPromise();
		const { promise: p2, resolve: r2 } = invertedPromise();
		const checker = new LinkChecker().on('retry', (info) => {
			if (info.url === 'http://example.invalid/1') {
				r1();
			} else if (info.url === 'http://example.invalid/3') {
				r2();
			}
		});
		const clock = vi.useFakeTimers({ shouldAdvanceTime: true });
		const checkPromise = checker.check({
			path: 'test/fixtures/retry',
			recurse: true,
			retry: true,
		});
		await Promise.all([p1, p2]);
		await clock.advanceTimersByTime(9000);
		const results = await checkPromise;
		assert.ok(results.passed);
	});

	function invertedPromise() {
		let resolve!: () => void;
		let reject!: (error: Error) => void;
		const promise = new Promise<void>((innerResolve, innerReject) => {
			resolve = innerResolve;
			reject = innerReject;
		});
		return { promise, resolve, reject };
	}

	describe('retry-errors', () => {
		it('should retry 5xx status code', async () => {
			const mockPool = mockAgent.get('http://example.invalid');
			mockPool.intercept({ path: '/', method: 'GET' }).reply(522, '');
			mockPool.intercept({ path: '/', method: 'GET' }).reply(200, '');

			const { promise, resolve } = invertedPromise();
			const checker = new LinkChecker().on('retry', resolve);
			const clock = vi.useFakeTimers({ shouldAdvanceTime: true });
			const checkPromise = checker.check({
				path: 'test/fixtures/basic',
				retryErrors: true,
			});
			await promise;
			await clock.advanceTimersByTime(5000);
			const results = await checkPromise;
			assert.ok(results.passed);
		});

		it('should retry 0 status code', async () => {
			const mockPool = mockAgent.get('http://example.invalid');
			mockPool
				.intercept({ path: '/', method: 'GET' })
				.replyWithError(new Error('ETIMEDOUT'));
			mockPool.intercept({ path: '/', method: 'GET' }).reply(200, '');

			const { promise, resolve } = invertedPromise();
			const checker = new LinkChecker().on('retry', resolve);
			const clock = vi.useFakeTimers({ shouldAdvanceTime: true });
			const checkPromise = checker.check({
				path: 'test/fixtures/basic',
				retryErrors: true,
				retryErrorsJitter: 10,
			});
			await promise;
			await clock.advanceTimersByTime(5000);
			const results = await checkPromise;
			assert.ok(results.passed);
		});

		it('should eventually stop retrying', async () => {
			const mockPool = mockAgent.get('http://example.invalid');
			// retryErrorsCount: 1 means 1 retry = 2 total attempts (initial + 1 retry)
			mockPool
				.intercept({ path: '/', method: 'GET' })
				.replyWithError(new Error('ETIMEDOUT'))
				.times(2);

			const { promise, resolve } = invertedPromise();
			const checker = new LinkChecker().on('retry', resolve);
			const clock = vi.useFakeTimers({ shouldAdvanceTime: true });
			const checkPromise = checker.check({
				path: 'test/fixtures/basic',
				retryErrors: true,
				retryErrorsCount: 1,
				retryErrorsJitter: 10,
			});
			await promise;
			await clock.advanceTimersByTime(10000);
			const results = await checkPromise;
			assert.ok(!results.passed);
		});

		it('should handle 429s without retry-after header as retry error', async () => {
			const mockPool = mockAgent.get('http://example.invalid');
			mockPool.intercept({ path: '/', method: 'HEAD' }).reply(429, '');
			mockPool.intercept({ path: '/', method: 'GET' }).reply(429, '');
			mockPool.intercept({ path: '/', method: 'GET' }).reply(200, '');

			const { promise, resolve } = invertedPromise();
			const checker = new LinkChecker().on('retry', resolve);
			const clock = vi.useFakeTimers({ shouldAdvanceTime: true });
			const checkPromise = checker.check({
				path: 'test/fixtures/basic',
				retryErrors: true,
			});
			await promise;
			await clock.advanceTimersByTime(10_000);
			const results = await checkPromise;
			assert.ok(results.passed);
		});

		it('should stop retrying 429s without retry-after header', async () => {
			const mockPool = mockAgent.get('http://example.invalid');
			mockPool.intercept({ path: '/', method: 'GET' }).reply(429, '');
			const { promise, resolve } = invertedPromise();
			const checker = new LinkChecker().on('retry', resolve);
			const clock = vi.useFakeTimers({ shouldAdvanceTime: true });
			const checkPromise = checker.check({
				path: 'test/fixtures/basic',
				retryErrors: true,
				retryErrorsCount: 1,
				retryErrorsJitter: 10,
			});
			await promise;
			await clock.advanceTimersByTime(10000);
			const results = await checkPromise;
			assert.ok(!results.passed);
		});
	});
});
