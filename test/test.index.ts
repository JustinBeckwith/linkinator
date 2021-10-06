import {strict as assert} from 'assert';
import {assert as assetChai} from 'chai';
import * as gaxios from 'gaxios';
import * as nock from 'nock';
import * as sinon from 'sinon';
import * as path from 'path';
import {describe, it, afterEach} from 'mocha';

import {check, LinkState, LinkChecker, CheckOptions, headers} from '../src';

nock.disableNetConnect();
nock.enableNetConnect('localhost');

describe('linkinator', () => {
  afterEach(() => {
    sinon.restore();
    nock.cleanAll();
  });

  it('should perform a basic shallow scan', async () => {
    const scope = nock('http://fake.local').head('/').reply(200);
    const results = await check({path: 'test/fixtures/basic'});
    assert.ok(results.passed);
    scope.done();
  });

  it('should only try a link once', async () => {
    const scope = nock('http://fake.local').head('/').reply(200);
    const results = await check({path: 'test/fixtures/twice'});
    assert.ok(results.passed);
    assert.equal(results.links.length, 2);
    scope.done();
  });

  it('should only queue a link once', async () => {
    const scope = nock('http://fake.local').head('/').reply(200);
    const checker = new LinkChecker();
    const checkerSpy = sinon.spy(checker, 'crawl');
    const results = await checker.check({path: 'test/fixtures/twice'});
    assert.ok(results.passed);
    assert.equal(results.links.length, 2);
    assert.equal(checkerSpy.callCount, 2);
    scope.done();
  });

  it('should skip links if asked nicely', async () => {
    const results = await check({
      path: 'test/fixtures/skip',
      linksToSkip: ['http://very.bad'],
    });
    assert.ok(results.passed);
    assert.equal(
      results.links.filter(x => x.state === LinkState.SKIPPED).length,
      1
    );
  });

  it('should skip links if passed a linksToSkip function', async () => {
    const scope = nock('https://good.com').head('/').reply(200);
    const results = await check({
      path: 'test/fixtures/filter',
      linksToSkip: link => Promise.resolve(link.includes('filterme')),
    });
    assert.ok(results.passed);
    assert.equal(
      results.links.filter(x => x.state === LinkState.SKIPPED).length,
      2
    );
    scope.done();
  });

  it('should report broken links', async () => {
    const scope = nock('http://fake.local').head('/').reply(404);
    const results = await check({path: 'test/fixtures/broke'});
    assert.ok(!results.passed);
    assert.equal(
      results.links.filter(x => x.state === LinkState.BROKEN).length,
      1
    );
    scope.done();
  });

  it('should handle relative links', async () => {
    const results = await check({
      path: 'test/fixtures/relative',
      recurse: true,
    });
    assert.ok(results.passed);
    assert.equal(results.links.length, 4);
  });

  it('should handle fetch exceptions', async () => {
    const requestStub = sinon.stub(gaxios, 'request');
    requestStub.throws('Fetch error');
    const results = await check({path: 'test/fixtures/basic'});
    assert.ok(!results.passed);
    assert.equal(
      results.links.filter(x => x.state === LinkState.BROKEN).length,
      1
    );
    requestStub.restore();
  });

  it('should report malformed links as broken', async () => {
    const results = await check({path: 'test/fixtures/malformed'});
    assert.ok(!results.passed);
    assert.equal(
      results.links.filter(x => x.state === LinkState.BROKEN).length,
      1
    );
  });

  it('should detect relative urls with relative base', async () => {
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
      const {fixture, nonBrokenUrl} = cases[i];
      const scope = nock('http://fake.local')
        .get('/pageBase/index')
        .replyWithFile(200, fixture, {
          'Content-Type': 'text/html; charset=UTF-8',
        })
        .head(nonBrokenUrl)
        .reply(200);

      const results = await check({
        path: 'http://fake.local/pageBase/index',
      });

      assert.equal(results.links.length, 3);
      assert.equal(
        results.links.filter(x => x.state === LinkState.BROKEN).length,
        1
      );
      scope.done();
    }
  });

  it('should detect relative urls with absolute base', async () => {
    const scope = nock('http://fake.local')
      .get('/pageBase/index')
      .replyWithFile(200, 'test/fixtures/basetag/absolute.html', {
        'Content-Type': 'text/html; charset=UTF-8',
      });

    const anotherScope = nock('http://another.fake.local')
      .head('/ok')
      .reply(200);

    const results = await check({
      path: 'http://fake.local/pageBase/index',
    });

    assert.equal(results.links.length, 3);
    assert.equal(
      results.links.filter(x => x.state === LinkState.BROKEN).length,
      1
    );
    scope.done();
    anotherScope.done();
  });

  it('should detect broken image links', async () => {
    const results = await check({path: 'test/fixtures/image'});
    assert.equal(
      results.links.filter(x => x.state === LinkState.BROKEN).length,
      2
    );
    assert.equal(results.links.filter(x => x.state === LinkState.OK).length, 2);
  });

  it('should perform a recursive scan', async () => {
    // This test is making sure that we do a recursive scan of links,
    // but also that we don't follow links to another site
    const scope = nock('http://fake.local').head('/').reply(200);
    const results = await check({
      path: 'test/fixtures/recurse',
      recurse: true,
    });
    assert.equal(results.links.length, 4);
    scope.done();
  });

  it('should not recurse non-html files', async () => {
    const results = await check({
      path: 'test/fixtures/scripts',
      recurse: true,
    });
    assert.equal(results.links.length, 2);
  });

  it('should not follow non-http[s] links', async () => {
    // includes mailto, data urls, and irc
    const results = await check({path: 'test/fixtures/protocols'});
    assert.ok(results.passed);
    assert.equal(
      results.links.filter(x => x.state === LinkState.SKIPPED).length,
      3
    );
  });

  it('should not recurse by default', async () => {
    const results = await check({path: 'test/fixtures/recurse'});
    assert.equal(results.links.length, 2);
  });

  it('should retry with a GET after a HEAD', async () => {
    const scopes = [
      nock('http://fake.local').head('/').reply(405),
      nock('http://fake.local').get('/').reply(200),
    ];
    const results = await check({path: 'test/fixtures/basic'});
    assert.ok(results.passed);
    scopes.forEach(x => x.done());
  });

  it('should only follow links on the same origin domain', async () => {
    const scopes = [
      nock('http://fake.local')
        .get('/')
        .replyWithFile(200, path.resolve('test/fixtures/baseurl/index.html'), {
          'content-type': 'text/html',
        }),
      nock('http://fake.local.br').head('/deep.html').reply(200),
    ];
    const results = await check({
      path: 'http://fake.local',
      recurse: true,
    });
    assert.equal(results.links.length, 2);
    assert.ok(results.passed);
    scopes.forEach(x => x.done());
  });

  it('should not attempt to validate preconnect or prefetch urls', async () => {
    const scope = nock('http://fake.local').head('/site.css').reply(200, '');
    const results = await check({path: 'test/fixtures/prefetch'});
    scope.done();
    assert.ok(results.passed);
    assert.equal(results.links.length, 2);
  });

  it('should attempt a GET request if a HEAD request fails on external links', async () => {
    const scopes = [
      nock('http://fake.local').head('/').reply(403),
      nock('http://fake.local').get('/').reply(200),
    ];
    const results = await check({path: 'test/fixtures/basic'});
    assert.ok(results.passed);
    scopes.forEach(x => x.done());
  });

  it('should support a configurable timeout', async () => {
    nock('http://fake.local').head('/').delay(200).reply(200);
    const results = await check({
      path: 'test/fixtures/basic',
      timeout: 1,
    });
    assert.ok(!results.passed);
  });

  it('should handle markdown', async () => {
    const results = await check({
      path: 'test/fixtures/markdown/README.md',
      markdown: true,
    });
    assert.equal(results.links.length, 3);
    assert.ok(results.passed);
  });

  it('should throw an error if you pass server-root and an http based path', async () => {
    await assert.rejects(
      check({
        path: 'https://jbeckwith.com',
        serverRoot: process.cwd(),
      }),
      /cannot be defined/
    );
  });

  it('should allow overriding the server root', async () => {
    const results = await check({
      serverRoot: 'test/fixtures/markdown',
      path: 'README.md',
    });
    assert.equal(results.links.length, 3);
    assert.ok(results.passed);
  });

  it('should accept multiple filesystem paths', async () => {
    const scope = nock('http://fake.local').head('/').reply(200);
    const results = await check({
      path: ['test/fixtures/basic', 'test/fixtures/image'],
    });
    assert.equal(results.passed, false);
    assert.equal(results.links.length, 6);
    scope.done();
  });

  it('should not allow mixed local and remote paths', async () => {
    await assert.rejects(
      check({
        path: ['https://jbeckwith.com', 'test/fixtures/basic'],
      }),
      /cannot be mixed/
    );
  });

  it('should require at least one path', async () => {
    await assert.rejects(
      check({
        path: [],
      }),
      /At least one/
    );
  });

  it('should not pollute the original options after merge', async () => {
    const options: CheckOptions = Object.freeze({path: 'test/fixtures/basic'});
    const scope = nock('http://fake.local').head('/').reply(200);
    const results = await check(options);
    assert.ok(results.passed);
    scope.done();
    assert.equal(options.serverRoot, undefined);
  });

  it('should accept multiple http paths', async () => {
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
    const results = await check({
      path: ['http://fake.local', 'http://fake2.local'],
    });
    assert.ok(results.passed);
    scopes.forEach(x => x.done());
  });

  it('should print debug information when the env var is set', async () => {
    sinon.stub(process, 'env').value({
      LINKINATOR_DEBUG: true,
    });
    const consoleSpy = sinon.stub(console, 'log');
    const results = await check({
      path: 'test/fixtures/markdown/README.md',
    });
    assert.ok(results.passed);
    assert.ok(consoleSpy.calledOnce);
  });

  it('should respect globs', async () => {
    const results = await check({
      path: 'test/fixtures/markdown/**/*.md',
    });
    assert.ok(results.passed);
    assert.equal(results.links.length, 6);
    const licenseLink = results.links.find(x => x.url.endsWith('LICENSE.md'));
    assert.ok(licenseLink);
    assert.equal(licenseLink.url, 'test/fixtures/markdown/LICENSE.md');
  });

  it('should autoscan markdown if specifically in path', async () => {
    const results = await check({
      path: 'test/fixtures/markdown/README.md',
    });
    assert.ok(results.passed);
    assert.equal(results.links.length, 3);
  });

  it('should throw if a glob provides no paths to scan', async () => {
    await assert.rejects(
      check({
        path: 'test/fixtures/basic/*.md',
      }),
      /returned 0 results/
    );
  });

  it('should always send a human looking User-Agent', async () => {
    const scopes = [
      nock('http://fake.local')
        .get('/', undefined, {reqheaders: headers})
        .replyWithFile(200, 'test/fixtures/local/index.html', {
          'Content-Type': 'text/html; charset=UTF-8',
        }),
      nock('http://fake.local')
        .get('/page2.html', undefined, {reqheaders: headers})
        .replyWithFile(200, 'test/fixtures/local/page2.html', {
          'Content-Type': 'text/html; charset=UTF-8',
        }),
    ];
    const results = await check({
      path: 'http://fake.local',
    });
    assert.ok(results.passed);
    scopes.forEach(x => x.done());
  });

  it('should surface call stacks on failures in the API', async () => {
    const results = await check({
      path: 'http://fake.local',
    });
    assert.ok(!results.passed);
    const err = results.links[0].failureDetails![0] as Error;
    assetChai.match(err.message, /Nock: Disallowed net connect for/);
  });

  it('should respect server root with globs', async () => {
    const scope = nock('http://fake.local')
      .get('/doll1')
      .reply(200)
      .get('/doll2')
      .reply(200);
    const results = await check({
      serverRoot: 'test/fixtures/nested',
      path: '*/*.html',
    });
    assert.equal(results.links.length, 4);
    assert.ok(results.passed);
    scope.done();
  });

  it('should respect absolute server root', async () => {
    const scope = nock('http://fake.local')
      .get('/doll1')
      .reply(200)
      .get('/doll2')
      .reply(200);
    const results = await check({
      serverRoot: path.resolve('test/fixtures/nested'),
      path: '*/*.html',
    });
    assert.equal(results.links.length, 4);
    assert.ok(results.passed);
    scope.done();
  });

  it('should scan links in <meta content="URL"> tags', async () => {
    const scope = nock('http://fake.local').head('/').reply(200);
    const results = await check({path: 'test/fixtures/twittercard'});
    assert.ok(results.passed);
    scope.done();
    assert.equal(results.links.length, 2);
  });

  it('should support directory index', async () => {
    const results = await check({
      path: 'test/fixtures/directoryIndex/README.md',
      directoryListing: true,
    });
    assert.ok(results.passed);
    assert.equal(results.links.length, 3);
  });

  it('should disabling directory index by default', async () => {
    const results = await check({
      path: 'test/fixtures/directoryIndex/README.md',
    });
    assert.ok(!results.passed);
    assert.equal(results.links.length, 3);
  });

  it('should provide a relative path in the results', async () => {
    const scope = nock('http://fake.local').head('/').reply(200);
    const results = await check({path: 'test/fixtures/basic'});
    assert.equal(results.links.length, 2);
    const [rootLink, fakeLink] = results.links;
    assert.equal(rootLink.url, path.join('test', 'fixtures', 'basic'));
    assert.equal(fakeLink.url, 'http://fake.local/');
    scope.done();
  });

  it('should provide a server root relative path in the results', async () => {
    const scope = nock('http://fake.local').head('/').reply(200);
    const results = await check({
      path: '.',
      serverRoot: 'test/fixtures/basic',
    });
    assert.equal(results.links.length, 2);
    const [rootLink, fakeLink] = results.links;
    assert.equal(rootLink.url, `.${path.sep}`);
    assert.equal(fakeLink.url, 'http://fake.local/');
    scope.done();
  });

  it('should rewrite urls', async () => {
    const results = await check({
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

  it('should report malformed links as broken', async () => {
    const results = await check({path: 'test/fixtures/malformed'});
    assert.ok(!results.passed);
    assert.equal(
      results.links.filter(x => x.state === LinkState.BROKEN).length,
      1
    );
  });

  it('should handle comma separated srcset', async () => {
    const results = await check({path: 'test/fixtures/srcset'});
    assert.ok(results.passed);
  });
});
