"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const chai_1 = require("chai");
const nock = require("nock");
const sinon = require("sinon");
const mocha_1 = require("mocha");
const src_1 = require("../src");
nock.disableNetConnect();
nock.enableNetConnect('localhost');
mocha_1.describe('retries', () => {
    mocha_1.afterEach(() => {
        sinon.restore();
        nock.cleanAll();
    });
    mocha_1.it('should handle 429s with invalid retry-after headers', async () => {
        const scope = nock('http://fake.local').get('/').reply(429, undefined, {
            'retry-after': 'totally-not-valid',
        });
        const results = await src_1.check({
            path: 'test/fixtures/basic',
            retry: true,
        });
        chai_1.assert.ok(!results.passed);
        scope.done();
    });
    mocha_1.it('should retry 429s with second based header', async () => {
        const scope = nock('http://fake.local')
            .get('/')
            .reply(429, undefined, {
            'retry-after': '10',
        })
            .get('/')
            .reply(200);
        const { promise, resolve } = invertedPromise();
        const checker = new src_1.LinkChecker().on('retry', resolve);
        const clock = sinon.useFakeTimers({
            shouldAdvanceTime: true,
        });
        const checkPromise = checker.check({
            path: 'test/fixtures/basic',
            retry: true,
        });
        await promise;
        await clock.tickAsync(10000);
        const results = await checkPromise;
        chai_1.assert.ok(results.passed);
        scope.done();
    });
    mocha_1.it('should retry 429s after failed HEAD', async () => {
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
        const checker = new src_1.LinkChecker().on('retry', resolve);
        const clock = sinon.useFakeTimers({
            shouldAdvanceTime: true,
        });
        const checkPromise = checker.check({
            path: 'test/fixtures/basic',
            retry: true,
        });
        await promise;
        await clock.tickAsync(10000);
        const results = await checkPromise;
        chai_1.assert.ok(results.passed);
        scope.done();
    });
    mocha_1.it('should retry 429s with date based header', async () => {
        const scope = nock('http://fake.local')
            .get('/')
            .reply(429, undefined, {
            'retry-after': '1970-01-01T00:00:10.000Z',
        })
            .get('/')
            .reply(200);
        const { promise, resolve } = invertedPromise();
        const checker = new src_1.LinkChecker().on('retry', resolve);
        const clock = sinon.useFakeTimers({
            shouldAdvanceTime: true,
        });
        const checkPromise = checker.check({
            path: 'test/fixtures/basic',
            retry: true,
        });
        await promise;
        await clock.tickAsync(10000);
        const results = await checkPromise;
        chai_1.assert.ok(results.passed);
        scope.done();
    });
    mocha_1.it('should detect requests to wait on the same host', async () => {
        const scope = nock('http://fake.local')
            .get('/1')
            .reply(429, undefined, {
            'retry-after': '3',
        })
            .get('/1', () => {
            chai_1.assert.isAtLeast(Date.now(), 3000);
            return true;
        })
            .reply(200)
            .get('/2', () => {
            chai_1.assert.isAtLeast(Date.now(), 3000);
            return true;
        })
            .reply(200)
            .get('/3')
            .reply(429, undefined, {
            'retry-after': '3',
        })
            .get('/3', () => {
            chai_1.assert.isAtLeast(Date.now(), 3000);
            return true;
        })
            .reply(200);
        const { promise, resolve } = invertedPromise();
        const checker = new src_1.LinkChecker().on('retry', resolve);
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
        chai_1.assert.ok(results.passed);
        scope.done();
    });
    mocha_1.it('should increase timeout for followup requests to a host', async () => {
        const scope = nock('http://fake.local')
            .get('/1')
            .reply(429, undefined, {
            'retry-after': '3',
        })
            .get('/1', () => {
            // even though the header said to wait 3 seconds, we are checking to
            // make sure the /3 route reset it to 9 seconds here. This is common
            // when a flood of requests come through and the retry-after gets
            // extended.
            chai_1.assert.isAtLeast(Date.now(), 9000);
            return true;
        })
            .reply(200)
            .get('/2', () => {
            chai_1.assert.isAtLeast(Date.now(), 9000);
            return true;
        })
            .reply(200)
            .get('/3')
            .reply(429, undefined, {
            'retry-after': '9',
        })
            .get('/3', () => {
            chai_1.assert.isAtLeast(Date.now(), 9000);
            return true;
        })
            .reply(200);
        const { promise: p1, resolve: r1 } = invertedPromise();
        const { promise: p2, resolve: r2 } = invertedPromise();
        const checker = new src_1.LinkChecker().on('retry', info => {
            if (info.url === 'http://fake.local/1') {
                r1();
            }
            else if (info.url === 'http://fake.local/3') {
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
        chai_1.assert.ok(results.passed);
        scope.done();
    });
    function invertedPromise() {
        let resolve;
        let reject;
        const promise = new Promise((innerResolve, innerReject) => {
            resolve = innerResolve;
            reject = innerReject;
        });
        return { promise, resolve, reject };
    }
});
//# sourceMappingURL=test.retry.js.map