import assert from 'node:assert';
import { afterEach, describe, it } from 'mocha';
import nock from 'nock';
import * as sinon from 'sinon';
import { LinkChecker, check } from '../src/index.js';

nock.disableNetConnect();
nock.enableNetConnect('localhost');

describe('retries', function () {
	this.timeout(5_000);

	afterEach(() => {
		sinon.restore();
		nock.cleanAll();
	});

	it('should handle 429s with invalid retry-after headers', async () => {
		const scope = nock('http://fake.local').get('/').reply(429, undefined, {
			'retry-after': 'totally-not-valid',
		});
		const results = await check({
			path: 'test/fixtures/basic',
			retry: true,
		});
		assert.ok(!results.passed);
		scope.done();
	});

	it('should ignore 429s without retry-after header', async () => {
		const scope = nock('http://fake.local').get('/').reply(429);
		const results = await check({
			path: 'test/fixtures/basic',
			retry: true,
			retryNoHeader: false,
		});
		assert.ok(!results.passed);
		scope.done();
	});

	it('should retry 429s with second based header', async () => {
		const scope = nock('http://fake.local')
			.get('/')
			.reply(429, undefined, {
				'retry-after': '10',
			})
			.get('/')
			.reply(200);

		const { promise, resolve } = invertedPromise();
		const checker = new LinkChecker().on('retry', resolve);
		const clock = sinon.useFakeTimers({
			shouldAdvanceTime: true,
		});
		const checkPromise = checker.check({
			path: 'test/fixtures/basic',
			retry: true,
		});

		await promise;
		await clock.tickAsync(10_000);
		const results = await checkPromise;
		assert.ok(results.passed);
		scope.done();
	});

	it('should retry 429s after failed HEAD', async () => {
		const scope = nock('http://fake.local')
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
		const clock = sinon.useFakeTimers({
			shouldAdvanceTime: true,
		});
		const checkPromise = checker.check({
			path: 'test/fixtures/basic',
			retry: true,
		});
		await promise;
		await clock.tickAsync(10_000);
		const results = await checkPromise;
		assert.ok(results.passed);
		scope.done();
	});

	it('should retry 429s with date based header', async () => {
		const scope = nock('http://fake.local')
			.get('/')
			.reply(429, undefined, {
				'retry-after': '1970-01-01T00:00:10.000Z',
			})
			.get('/')
			.reply(200);

		const { promise, resolve } = invertedPromise();
		const checker = new LinkChecker().on('retry', resolve);
		const clock = sinon.useFakeTimers({
			shouldAdvanceTime: true,
		});
		const checkPromise = checker.check({
			path: 'test/fixtures/basic',
			retry: true,
		});
		await promise;
		await clock.tickAsync(10_000);
		const results = await checkPromise;
		assert.ok(results.passed);
		scope.done();
	});

	it('should detect requests to wait on the same host', async () => {
		const scope = nock('http://fake.local')
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
		const clock = sinon.useFakeTimers({
			shouldAdvanceTime: true,
		});
		const checkPromise = checker.check({
			path: 'test/fixtures/retry',
			recurse: true,
			retry: true,
		});
		await promise;
		await clock.tickAsync(3000);
		const results = await checkPromise;
		assert.ok(results.passed);
		scope.done();
	});

	it('should increase timeout for followup requests to a host', async () => {
		const scope = nock('http://fake.local')
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
			if (info.url === 'http://fake.local/1') {
				r1();
			} else if (info.url === 'http://fake.local/3') {
				r2();
			}
		});
		const clock = sinon.useFakeTimers({
			shouldAdvanceTime: true,
		});
		const checkPromise = checker.check({
			path: 'test/fixtures/retry',
			recurse: true,
			retry: true,
		});
		await Promise.all([p1, p2]);
		await clock.tickAsync(9000);
		const results = await checkPromise;
		assert.ok(results.passed);
		scope.done();
	});

	it('should handle `retry-after` value of 0 by retrying again without delay', async () => {
		const scope = nock('http://fake.local')
			.get('/')
			.reply(429, undefined, {
				'retry-after': '0',
			})
			.get('/')
			.reply(200);
		const results = await check({
			path: 'test/fixtures/basic',
			retry: true,
		});
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

	describe('retry-no-header', () => {
		it('should use preconfigured delay on 429s', async () => {
			const scope = nock('http://fake.local')
				.get('/')
				.reply(429)
				.get('/')
				.reply(200);

			const { promise, resolve } = invertedPromise();
			const checker = new LinkChecker().on('retry', resolve);
			const clock = sinon.useFakeTimers({
				shouldAdvanceTime: true,
			});
			const checkPromise = checker.check({
				path: 'test/fixtures/basic',
				retryNoHeader: true,
				retryNoHeaderDelay: 30_000,
			});

			await promise;
			await clock.tickAsync(30_000);
			const results = await checkPromise;
			assert.ok(results.passed);
			scope.done();
		});

		it('should use `retry` instead of `retryNoHeader` when `retry-after` header exists', async () => {
			const scope = nock('http://fake.local')
				.get('/')
				.reply(429, undefined, { 'retry-after': '5' })
				.get('/')
				.reply(200);

			const { promise, resolve } = invertedPromise();
			const checker = new LinkChecker().on('retry', resolve);
			const clock = sinon.useFakeTimers({
				shouldAdvanceTime: true,
			});
			const checkPromise = checker.check({
				path: 'test/fixtures/basic',
				retry: true,
				retryNoHeader: true,
				retryNoHeaderDelay: 100_000,
			});

			await promise;
			await clock.tickAsync(5_000);
			const results = await checkPromise;
			assert.ok(results.passed);
			scope.done();
		});

		it('should retry multiple times', async () => {
			const scope = nock('http://fake.local')
				.get('/')
				.reply(429)
				.get('/')
				.reply(429)
				.get('/')
				.reply(200);

			const { promise, resolve } = invertedPromise();
			let count = 0;
			const checker = new LinkChecker().on('retry', () => {
				count++;
				if (count >= 2) resolve();
			});
			const checkPromise = checker.check({
				path: 'test/fixtures/basic',
				retryNoHeader: true,
				retryNoHeaderCount: 2,
				retryNoHeaderDelay: 10,
			});

			await promise;
			const results = await checkPromise;
			assert.ok(results.passed);
			scope.done();
		});

		it('should abort after reaching retryNoHeaderCount', async () => {
			const scope = nock('http://fake.local').persist().get('/').reply(429);
			const { promise, resolve } = invertedPromise();
			const retries = 2;
			let retryEvents = 0;
			const checker = new LinkChecker().on('retry', () => {
				retryEvents++;
				if (retryEvents === retries) resolve();
			});
			const clock = sinon.useFakeTimers({ shouldAdvanceTime: true });
			const checkPromise = checker.check({
				path: 'test/fixtures/basic',
				retryNoHeader: true,
				retryNoHeaderCount: retries,
				retryNoHeaderDelay: 100,
			});

			await promise;
			await clock.tickAsync(10_000);
			const results = await checkPromise;
			assert.ok(!results.passed);
			assert.strictEqual(
				retryEvents,
				retries,
				'should not retry more than 2 times',
			);
			scope.done();
		});
	});

	describe('retry-errors', () => {
		it('should retry 5xx status code', async () => {
			const scope = nock('http://fake.local')
				.get('/')
				.reply(522)
				.get('/')
				.reply(200);

			const { promise, resolve } = invertedPromise();
			const checker = new LinkChecker().on('retry', resolve);
			const clock = sinon.useFakeTimers({
				shouldAdvanceTime: true,
			});
			const checkPromise = checker.check({
				path: 'test/fixtures/basic',
				retryErrors: true,
			});
			await promise;
			await clock.tickAsync(5000);
			const results = await checkPromise;
			assert.ok(results.passed);
			scope.done();
		});

		it('should retry 0 status code', async () => {
			const scope = nock('http://fake.local')
				.get('/')
				.replyWithError({ code: 'ETIMEDOUT' })
				.get('/')
				.reply(200);

			const { promise, resolve } = invertedPromise();
			const checker = new LinkChecker().on('retry', resolve);
			const clock = sinon.useFakeTimers({
				shouldAdvanceTime: true,
			});
			const checkPromise = checker.check({
				path: 'test/fixtures/basic',
				retryErrors: true,
				retryErrorsJitter: 10,
			});
			await promise;
			await clock.tickAsync(5000);
			const results = await checkPromise;
			assert.ok(results.passed);
			scope.done();
		});

		it('should eventually stop retrying', async () => {
			const scope = nock('http://fake.local')
				.get('/')
				.replyWithError({ code: 'ETIMEDOUT' });

			const { promise, resolve } = invertedPromise();
			const checker = new LinkChecker().on('retry', resolve);
			const clock = sinon.useFakeTimers({
				shouldAdvanceTime: true,
			});
			const checkPromise = checker.check({
				path: 'test/fixtures/basic',
				retryErrors: true,
				retryErrorsCount: 1,
				retryErrorsJitter: 10,
			});
			await promise;
			await clock.tickAsync(10000);
			const results = await checkPromise;
			assert.ok(!results.passed);
			scope.done();
		});
	});
});
