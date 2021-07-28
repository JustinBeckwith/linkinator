"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const chai_1 = require("chai");
const gaxios = require("gaxios");
const nock = require("nock");
const sinon = require("sinon");
const path = require("path");
const mocha_1 = require("mocha");
const src_1 = require("../src");
nock.disableNetConnect();
nock.enableNetConnect('localhost');
mocha_1.describe('linkinator', () => {
    mocha_1.afterEach(() => {
        sinon.restore();
        nock.cleanAll();
    });
    mocha_1.it('should perform a basic shallow scan', async () => {
        const scope = nock('http://fake.local').head('/').reply(200);
        const results = await src_1.check({ path: 'test/fixtures/basic' });
        assert.ok(results.passed);
        scope.done();
    });
    mocha_1.it('should only try a link once', async () => {
        const scope = nock('http://fake.local').head('/').reply(200);
        const results = await src_1.check({ path: 'test/fixtures/twice' });
        assert.ok(results.passed);
        assert.strictEqual(results.links.length, 2);
        scope.done();
    });
    mocha_1.it('should only queue a link once', async () => {
        const scope = nock('http://fake.local').head('/').reply(200);
        const checker = new src_1.LinkChecker();
        const checkerSpy = sinon.spy(checker, 'crawl');
        const results = await checker.check({ path: 'test/fixtures/twice' });
        assert.ok(results.passed);
        assert.strictEqual(results.links.length, 2);
        assert.strictEqual(checkerSpy.callCount, 2);
        scope.done();
    });
    mocha_1.it('should skip links if asked nicely', async () => {
        const results = await src_1.check({
            path: 'test/fixtures/skip',
            linksToSkip: ['http://very.bad'],
        });
        assert.ok(results.passed);
        assert.strictEqual(results.links.filter(x => x.state === src_1.LinkState.SKIPPED).length, 1);
    });
    mocha_1.it('should skip links if passed a linksToSkip function', async () => {
        const scope = nock('https://good.com').head('/').reply(200);
        const results = await src_1.check({
            path: 'test/fixtures/filter',
            linksToSkip: link => Promise.resolve(link.includes('filterme')),
        });
        assert.ok(results.passed);
        assert.strictEqual(results.links.filter(x => x.state === src_1.LinkState.SKIPPED).length, 2);
        scope.done();
    });
    mocha_1.it('should report broken links', async () => {
        const scope = nock('http://fake.local').head('/').reply(404);
        const results = await src_1.check({ path: 'test/fixtures/broke' });
        assert.ok(!results.passed);
        assert.strictEqual(results.links.filter(x => x.state === src_1.LinkState.BROKEN).length, 1);
        scope.done();
    });
    mocha_1.it('should handle relative links', async () => {
        const results = await src_1.check({
            path: 'test/fixtures/relative',
            recurse: true,
        });
        assert.ok(results.passed);
        assert.strictEqual(results.links.length, 4);
    });
    mocha_1.it('should handle fetch exceptions', async () => {
        const requestStub = sinon.stub(gaxios, 'request');
        requestStub.throws('Fetch error');
        const results = await src_1.check({ path: 'test/fixtures/basic' });
        assert.ok(!results.passed);
        assert.strictEqual(results.links.filter(x => x.state === src_1.LinkState.BROKEN).length, 1);
        requestStub.restore();
    });
    mocha_1.it('should report malformed links as broken', async () => {
        const results = await src_1.check({ path: 'test/fixtures/malformed' });
        assert.ok(!results.passed);
        assert.strictEqual(results.links.filter(x => x.state === src_1.LinkState.BROKEN).length, 1);
    });
    mocha_1.it('should detect relative urls with relative base', async () => {
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
        for (let i = 0; i < cases.length; i++) {
            const { fixture, nonBrokenUrl } = cases[i];
            const scope = nock('http://fake.local')
                .get('/pageBase/index')
                .replyWithFile(200, fixture, {
                'Content-Type': 'text/html; charset=UTF-8',
            })
                .head(nonBrokenUrl)
                .reply(200);
            const results = await src_1.check({
                path: 'http://fake.local/pageBase/index',
            });
            assert.strictEqual(results.links.length, 3);
            assert.strictEqual(results.links.filter(x => x.state === src_1.LinkState.BROKEN).length, 1);
            scope.done();
        }
    });
    mocha_1.it('should detect relative urls with absolute base', async () => {
        const scope = nock('http://fake.local')
            .get('/pageBase/index')
            .replyWithFile(200, 'test/fixtures/basetag/absolute.html', {
            'Content-Type': 'text/html; charset=UTF-8',
        });
        const anotherScope = nock('http://another.fake.local')
            .head('/ok')
            .reply(200);
        const results = await src_1.check({
            path: 'http://fake.local/pageBase/index',
        });
        assert.strictEqual(results.links.length, 3);
        assert.strictEqual(results.links.filter(x => x.state === src_1.LinkState.BROKEN).length, 1);
        scope.done();
        anotherScope.done();
    });
    mocha_1.it('should detect broken image links', async () => {
        const results = await src_1.check({ path: 'test/fixtures/image' });
        assert.strictEqual(results.links.filter(x => x.state === src_1.LinkState.BROKEN).length, 2);
        assert.strictEqual(results.links.filter(x => x.state === src_1.LinkState.OK).length, 2);
    });
    mocha_1.it('should perform a recursive scan', async () => {
        // This test is making sure that we do a recursive scan of links,
        // but also that we don't follow links to another site
        const scope = nock('http://fake.local').head('/').reply(200);
        const results = await src_1.check({
            path: 'test/fixtures/recurse',
            recurse: true,
        });
        assert.strictEqual(results.links.length, 4);
        scope.done();
    });
    mocha_1.it('should not recurse non-html files', async () => {
        const results = await src_1.check({
            path: 'test/fixtures/scripts',
            recurse: true,
        });
        assert.strictEqual(results.links.length, 2);
    });
    mocha_1.it('should not follow non-http[s] links', async () => {
        // includes mailto, data urls, and irc
        const results = await src_1.check({ path: 'test/fixtures/protocols' });
        assert.ok(results.passed);
        assert.strictEqual(results.links.filter(x => x.state === src_1.LinkState.SKIPPED).length, 3);
    });
    mocha_1.it('should not recurse by default', async () => {
        const results = await src_1.check({ path: 'test/fixtures/recurse' });
        assert.strictEqual(results.links.length, 2);
    });
    mocha_1.it('should retry with a GET after a HEAD', async () => {
        const scopes = [
            nock('http://fake.local').head('/').reply(405),
            nock('http://fake.local').get('/').reply(200),
        ];
        const results = await src_1.check({ path: 'test/fixtures/basic' });
        assert.ok(results.passed);
        scopes.forEach(x => x.done());
    });
    mocha_1.it('should only follow links on the same origin domain', async () => {
        const scopes = [
            nock('http://fake.local')
                .get('/')
                .replyWithFile(200, path.resolve('test/fixtures/baseurl/index.html'), {
                'content-type': 'text/html',
            }),
            nock('http://fake.local.br').head('/deep.html').reply(200),
        ];
        const results = await src_1.check({
            path: 'http://fake.local',
            recurse: true,
        });
        assert.strictEqual(results.links.length, 2);
        assert.ok(results.passed);
        scopes.forEach(x => x.done());
    });
    mocha_1.it('should not attempt to validate preconnect or prefetch urls', async () => {
        const scope = nock('http://fake.local').head('/site.css').reply(200, '');
        const results = await src_1.check({ path: 'test/fixtures/prefetch' });
        scope.done();
        assert.ok(results.passed);
        assert.strictEqual(results.links.length, 2);
    });
    mocha_1.it('should attempt a GET request if a HEAD request fails on external links', async () => {
        const scopes = [
            nock('http://fake.local').head('/').reply(403),
            nock('http://fake.local').get('/').reply(200),
        ];
        const results = await src_1.check({ path: 'test/fixtures/basic' });
        assert.ok(results.passed);
        scopes.forEach(x => x.done());
    });
    mocha_1.it('should support a configurable timeout', async () => {
        nock('http://fake.local').head('/').delay(200).reply(200);
        const results = await src_1.check({
            path: 'test/fixtures/basic',
            timeout: 1,
        });
        assert.ok(!results.passed);
    });
    mocha_1.it('should handle markdown', async () => {
        const results = await src_1.check({
            path: 'test/fixtures/markdown/README.md',
            markdown: true,
        });
        assert.strictEqual(results.links.length, 3);
        assert.ok(results.passed);
    });
    mocha_1.it('should throw an error if you pass server-root and an http based path', async () => {
        await assert.rejects(src_1.check({
            path: 'https://jbeckwith.com',
            serverRoot: process.cwd(),
        }), /cannot be defined/);
    });
    mocha_1.it('should allow overriding the server root', async () => {
        const results = await src_1.check({
            serverRoot: 'test/fixtures/markdown',
            path: 'README.md',
        });
        assert.strictEqual(results.links.length, 3);
        assert.ok(results.passed);
    });
    mocha_1.it('should accept multiple filesystem paths', async () => {
        const scope = nock('http://fake.local').head('/').reply(200);
        const results = await src_1.check({
            path: ['test/fixtures/basic', 'test/fixtures/image'],
        });
        assert.strictEqual(results.passed, false);
        assert.strictEqual(results.links.length, 6);
        scope.done();
    });
    mocha_1.it('should not allow mixed local and remote paths', async () => {
        await assert.rejects(src_1.check({
            path: ['https://jbeckwith.com', 'test/fixtures/basic'],
        }), /cannot be mixed/);
    });
    mocha_1.it('should require at least one path', async () => {
        await assert.rejects(src_1.check({
            path: [],
        }), /At least one/);
    });
    mocha_1.it('should not pollute the original options after merge', async () => {
        const options = Object.freeze({ path: 'test/fixtures/basic' });
        const scope = nock('http://fake.local').head('/').reply(200);
        const results = await src_1.check(options);
        assert.ok(results.passed);
        scope.done();
        assert.strictEqual(options.serverRoot, undefined);
    });
    mocha_1.it('should accept multiple http paths', async () => {
        const scopes = [
            nock('http://fake.local')
                .get('/')
                .replyWithFile(200, 'test/fixtures/local/index.html', {
                'Content-Type': 'text/html; charset=UTF-8',
            }),
            nock('http://fake.local')
                .get('/page2.html')
                .replyWithFile(200, 'test/fixtures/local/page2.html', {
                'Content-Type': 'text/html; charset=UTF-8',
            }),
            nock('http://fake2.local')
                .get('/')
                .replyWithFile(200, 'test/fixtures/local/index.html', {
                'Content-Type': 'text/html; charset=UTF-8',
            }),
            nock('http://fake2.local')
                .get('/page2.html')
                .replyWithFile(200, 'test/fixtures/local/page2.html', {
                'Content-Type': 'text/html; charset=UTF-8',
            }),
        ];
        const results = await src_1.check({
            path: ['http://fake.local', 'http://fake2.local'],
        });
        assert.ok(results.passed);
        scopes.forEach(x => x.done());
    });
    mocha_1.it('should print debug information when the env var is set', async () => {
        sinon.stub(process, 'env').value({
            LINKINATOR_DEBUG: true,
        });
        const consoleSpy = sinon.stub(console, 'log');
        const results = await src_1.check({
            path: 'test/fixtures/markdown/README.md',
        });
        assert.ok(results.passed);
        assert.ok(consoleSpy.calledOnce);
    });
    mocha_1.it('should respect globs', async () => {
        const results = await src_1.check({
            path: 'test/fixtures/markdown/**/*.md',
        });
        assert.ok(results.passed);
        assert.strictEqual(results.links.length, 6);
        const licenseLink = results.links.find(x => x.url.endsWith('LICENSE.md'));
        assert.ok(licenseLink);
        assert.strictEqual(licenseLink.url, 'test/fixtures/markdown/LICENSE.md');
    });
    mocha_1.it('should autoscan markdown if specifically in path', async () => {
        const results = await src_1.check({
            path: 'test/fixtures/markdown/README.md',
        });
        assert.ok(results.passed);
        assert.strictEqual(results.links.length, 3);
    });
    mocha_1.it('should throw if a glob provides no paths to scan', async () => {
        await assert.rejects(src_1.check({
            path: 'test/fixtures/basic/*.md',
        }), /returned 0 results/);
    });
    mocha_1.it('should always send a human looking User-Agent', async () => {
        const scopes = [
            nock('http://fake.local')
                .get('/', undefined, { reqheaders: src_1.headers })
                .replyWithFile(200, 'test/fixtures/local/index.html', {
                'Content-Type': 'text/html; charset=UTF-8',
            }),
            nock('http://fake.local')
                .get('/page2.html', undefined, { reqheaders: src_1.headers })
                .replyWithFile(200, 'test/fixtures/local/page2.html', {
                'Content-Type': 'text/html; charset=UTF-8',
            }),
        ];
        const results = await src_1.check({
            path: 'http://fake.local',
        });
        assert.ok(results.passed);
        scopes.forEach(x => x.done());
    });
    mocha_1.it('should surface call stacks on failures in the API', async () => {
        const results = await src_1.check({
            path: 'http://fake.local',
        });
        assert.ok(!results.passed);
        const err = results.links[0].failureDetails[0];
        chai_1.assert.match(err.message, /Nock: Disallowed net connect for/);
    });
    mocha_1.it('should respect server root with globs', async () => {
        const scope = nock('http://fake.local')
            .get('/doll1')
            .reply(200)
            .get('/doll2')
            .reply(200);
        const results = await src_1.check({
            serverRoot: 'test/fixtures/nested',
            path: '*/*.html',
        });
        assert.strictEqual(results.links.length, 4);
        assert.ok(results.passed);
        scope.done();
    });
    mocha_1.it('should respect absolute server root', async () => {
        const scope = nock('http://fake.local')
            .get('/doll1')
            .reply(200)
            .get('/doll2')
            .reply(200);
        const results = await src_1.check({
            serverRoot: path.resolve('test/fixtures/nested'),
            path: '*/*.html',
        });
        assert.strictEqual(results.links.length, 4);
        assert.ok(results.passed);
        scope.done();
    });
    mocha_1.it('should scan links in <meta content="URL"> tags', async () => {
        const scope = nock('http://fake.local').head('/').reply(200);
        const results = await src_1.check({ path: 'test/fixtures/twittercard' });
        assert.ok(results.passed);
        scope.done();
        assert.strictEqual(results.links.length, 2);
    });
    mocha_1.it('should support directory index', async () => {
        const results = await src_1.check({
            path: 'test/fixtures/directoryIndex/README.md',
            directoryListing: true,
        });
        assert.ok(results.passed);
        assert.strictEqual(results.links.length, 3);
    });
    mocha_1.it('should disabling directory index by default', async () => {
        const results = await src_1.check({
            path: 'test/fixtures/directoryIndex/README.md',
        });
        assert.ok(!results.passed);
        assert.strictEqual(results.links.length, 3);
    });
    mocha_1.it('should provide a relative path in the results', async () => {
        const scope = nock('http://fake.local').head('/').reply(200);
        const results = await src_1.check({ path: 'test/fixtures/basic' });
        assert.strictEqual(results.links.length, 2);
        const [rootLink, fakeLink] = results.links;
        assert.strictEqual(rootLink.url, path.join('test', 'fixtures', 'basic'));
        assert.strictEqual(fakeLink.url, 'http://fake.local/');
        scope.done();
    });
    mocha_1.it('should provide a server root relative path in the results', async () => {
        const scope = nock('http://fake.local').head('/').reply(200);
        const results = await src_1.check({
            path: '.',
            serverRoot: 'test/fixtures/basic',
        });
        assert.strictEqual(results.links.length, 2);
        const [rootLink, fakeLink] = results.links;
        assert.strictEqual(rootLink.url, `.${path.sep}`);
        assert.strictEqual(fakeLink.url, 'http://fake.local/');
        scope.done();
    });
    mocha_1.it('should rewrite urls', async () => {
        const results = await src_1.check({
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
});
//# sourceMappingURL=test.index.js.map