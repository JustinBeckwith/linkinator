import nock from 'nock';
import { afterEach, assert, describe, it, vi } from 'vitest';
import { check, LinkChecker } from '../src/index.js';

nock.disableNetConnect();
nock.enableNetConnect('localhost');

describe('retries', () => {
	afterEach(() => {
		vi.useRealTimers();
		vi.clearAllTimers();
		nock.cleanAll();
	});

	it('should handle 429s with invalid retry-after headers', async () => {
		const scope = nock('http://example.invalid')
			.get('/')
			.reply(429, undefined, {
				'retry-after': 'totally-not-valid',
			});
		const results = await check({
			path: 'test/fixtures/basic',
			retry: true,
		});
		assert.ok(!results.passed);
		scope.done();
	});

	it('should retry 429s with second based header', async () => {
		const scope = nock('http://example.invalid')
			.get('/')
			.reply(429, undefined, {
				'retry-after': '10',
			})
			.get('/')
			.reply(200);

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
		scope.done();
	});

	it('should retry 429s after failed HEAD', async () => {
		const scope = nock('http://example.invalid')
			.head('/')
			.reply(405)
			.get('/')
			.reply(429, undefined, {
				'retry-after': '10',
			})
			.get('/')
			.reply(200);

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
		scope.done();
	});

	it('should retry 429s with date based header', async () => {
		const scope = nock('http://example.invalid')
			.get('/')
			.reply(429, undefined, {
				'retry-after': '1970-01-01T00:00:10.000Z',
			})
			.get('/')
			.reply(200);

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
		scope.done();
	});

	it('should detect requests to wait on the same host', async () => {
		const scope = nock('http://example.invalid')
			.get('/1')
			.reply(429, undefined, {
				'retry-after': '3',
			})
			.get('/1', () => {
				assert.ok(Date.now() >= 3000);
				return true;
			})
			.reply(200)
			.get('/2', () => {
				assert.ok(Date.now() >= 3000);
				return true;
			})
			.reply(200)
			.get('/3')
			.reply(429, undefined, {
				'retry-after': '3',
			})
			.get('/3', () => {
				assert.ok(Date.now() >= 3000);
				return true;
			})
			.reply(200);

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
		scope.done();
	});

	it('should increase timeout for followup requests to a host', async () => {
		const scope = nock('http://example.invalid')
			.get('/1')
			.reply(429, undefined, {
				'retry-after': '3',
			})
			.get('/1', () => {
				// Even though the header said to wait 3 seconds, we are checking to
				// make sure the /3 route reset it to 9 seconds here. This is common
				// when a flood of requests come through and the retry-after gets
				// extended.
				assert.ok(Date.now() >= 9000);
				return true;
			})
			.reply(200)
			.get('/2', () => {
				assert.ok(Date.now() >= 9000);
				return true;
			})
			.reply(200)
			.get('/3')
			.reply(429, undefined, {
				'retry-after': '9',
			})
			.get('/3', () => {
				assert.ok(Date.now() >= 9000);
				return true;
			})
			.reply(200);

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
		scope.done();
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
			const scope = nock('http://example.invalid')
				.get('/')
				.reply(522)
				.get('/')
				.reply(200);

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
			scope.done();
		});

		it.skip('should retry 0 status code', async () => {
			const scope = nock('http://example.invalid')
				.get('/')
				.replyWithError({ code: 'ETIMEDOUT' })
				.get('/')
				.reply(200);

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
			scope.done();
		});

		it.skip('should eventually stop retrying', async () => {
			const scope = nock('http://example.invalid')
				.get('/')
				.replyWithError({ code: 'ETIMEDOUT' });

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
			scope.done();
		});
	});
});
