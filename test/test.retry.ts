import { HttpResponse, http } from 'msw';
import { afterEach, assert, describe, it, vi } from 'vitest';
import { check, LinkChecker } from '../src/index.js';
import { server } from './setup.js';

describe('retries', () => {
	afterEach(() => vi.useRealTimers());

	it('should handle 429s with invalid retry-after headers', async () => {
		let requestCount = 0;
		server.use(
			http.get('http://example.invalid/', () => {
				requestCount++;
				return HttpResponse.json(null, {
					status: 429,
					headers: {
						'retry-after': 'totally-not-valid',
					},
				});
			}),
		);

		const results = await check({
			path: 'test/fixtures/basic',
			retry: true,
		});
		assert.ok(!results.passed);
		assert.strictEqual(requestCount, 1);
	});

	it('should retry 429s with second based header', async () => {
		let requestCount = 0;
		server.use(
			http.get('http://example.invalid/', () => {
				requestCount++;
				if (requestCount === 1) {
					return HttpResponse.json(null, {
						status: 429,
						headers: {
							'retry-after': '10',
						},
					});
				}
				return HttpResponse.json(null, { status: 200 });
			}),
		);

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
		assert.ok(
			requestCount > 1,
			'Mock should have been called multiple times for retry',
		);
	});

	it('should retry 429s after failed HEAD', async () => {
		let requestCount = 0;
		server.use(
			http.head('http://example.invalid/', () => {
				return HttpResponse.json(null, { status: 405 });
			}),
			http.get('http://example.invalid/', () => {
				requestCount++;
				if (requestCount === 1) {
					return HttpResponse.json(null, {
						status: 429,
						headers: {
							'retry-after': '10',
						},
					});
				}
				return HttpResponse.json(null, { status: 200 });
			}),
		);

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
		let requestCount = 0;
		server.use(
			http.get('http://example.invalid/', () => {
				requestCount++;
				if (requestCount === 1) {
					return HttpResponse.json(null, {
						status: 429,
						headers: {
							'retry-after': '1970-01-01T00:00:10.000Z',
						},
					});
				}
				return HttpResponse.json(null, { status: 200 });
			}),
		);

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
		let requestCount1 = 0;
		let requestCount2 = 0;
		let requestCount3 = 0;

		server.use(
			http.get('http://example.invalid/1', () => {
				requestCount1++;
				if (requestCount1 === 1) {
					return HttpResponse.json(null, {
						status: 429,
						headers: {
							'retry-after': '3',
						},
					});
				}
				assert.ok(Date.now() >= 3000);
				return HttpResponse.json(null, { status: 200 });
			}),
			http.get('http://example.invalid/2', () => {
				requestCount2++;
				assert.ok(Date.now() >= 3000);
				return HttpResponse.json(null, { status: 200 });
			}),
			http.get('http://example.invalid/3', () => {
				requestCount3++;
				if (requestCount3 === 1) {
					return HttpResponse.json(null, {
						status: 429,
						headers: {
							'retry-after': '3',
						},
					});
				}
				assert.ok(Date.now() >= 3000);
				return HttpResponse.json(null, { status: 200 });
			}),
		);

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
		assert.ok(requestCount1 > 0, 'Mock 1 should have been called');
		assert.ok(requestCount2 > 0, 'Mock 2 should have been called');
		assert.ok(requestCount3 > 0, 'Mock 3 should have been called');
	});

	it('should increase timeout for followup requests to a host', async () => {
		let requestCount1 = 0;
		let _requestCount2 = 0;
		let requestCount3 = 0;

		server.use(
			http.get('http://example.invalid/1', () => {
				requestCount1++;
				if (requestCount1 === 1) {
					return HttpResponse.json(null, {
						status: 429,
						headers: {
							'retry-after': '3',
						},
					});
				}
				// Even though the header said to wait 3 seconds, we are checking to
				// make sure the /3 route reset it to 9 seconds here. This is common
				// when a flood of requests come through and the retry-after gets
				// extended.
				assert.ok(Date.now() >= 9000);
				return HttpResponse.json(null, { status: 200 });
			}),
			http.get('http://example.invalid/2', () => {
				_requestCount2++;
				assert.ok(Date.now() >= 9000);
				return HttpResponse.json(null, { status: 200 });
			}),
			http.get('http://example.invalid/3', () => {
				requestCount3++;
				if (requestCount3 === 1) {
					return HttpResponse.json(null, {
						status: 429,
						headers: {
							'retry-after': '9',
						},
					});
				}
				assert.ok(Date.now() >= 9000);
				return HttpResponse.json(null, { status: 200 });
			}),
		);

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
			let requestCount = 0;
			server.use(
				http.get('http://example.invalid/', () => {
					requestCount++;
					if (requestCount === 1) {
						return HttpResponse.json(null, { status: 522 });
					}
					return HttpResponse.json(null, { status: 200 });
				}),
			);

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
			assert.ok(
				requestCount > 1,
				'Mock should have been called multiple times for retry',
			);
		});

		it('should retry 0 status code', async () => {
			let requestCount = 0;
			server.use(
				http.get('http://example.invalid/', () => {
					requestCount++;
					if (requestCount === 1) {
						return HttpResponse.error();
					}
					return HttpResponse.json(null, { status: 200 });
				}),
			);

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
			assert.ok(
				requestCount > 1,
				'Mock should have been called multiple times for retry',
			);
		});

		it('should eventually stop retrying', async () => {
			server.use(
				http.get('http://example.invalid/', () => {
					return HttpResponse.error();
				}),
			);

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
