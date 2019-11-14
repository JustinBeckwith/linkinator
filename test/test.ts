import * as assert from 'assert';
import * as gaxios from 'gaxios';
import * as nock from 'nock';
import * as sinon from 'sinon';
import * as path from 'path';

import { check, LinkState } from '../src';

nock.disableNetConnect();
nock.enableNetConnect('localhost');

describe('linkinator', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('should perform a basic shallow scan', async () => {
    const scope = nock('http://fake.local')
      .head('/')
      .reply(200);
    const results = await check({ path: 'test/fixtures/basic' });
    assert.ok(results.passed);
    scope.done();
  });

  it('should only try a link once', async () => {
    const scope = nock('http://fake.local')
      .head('/')
      .reply(200);
    const results = await check({ path: 'test/fixtures/twice' });
    assert.ok(results.passed);
    assert.strictEqual(results.links.length, 2);
    scope.done();
  });

  it('should skip links if asked nicely', async () => {
    const results = await check({
      path: 'test/fixtures/skip',
      linksToSkip: ['http://very.bad'],
    });
    assert.ok(results.passed);
    assert.strictEqual(
      results.links.filter(x => x.state === LinkState.SKIPPED).length,
      1
    );
  });

  it('should report broken links', async () => {
    const scope = nock('http://fake.local')
      .head('/')
      .reply(404);
    const results = await check({ path: 'test/fixtures/broke' });
    assert.ok(!results.passed);
    assert.strictEqual(
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
    assert.strictEqual(results.links.length, 4);
  });

  it('should handle fetch exceptions', async () => {
    const requestStub = sinon.stub(gaxios, 'request');
    requestStub.throws('Fetch error');
    const results = await check({ path: 'test/fixtures/basic' });
    assert.ok(!results.passed);
    assert.strictEqual(
      results.links.filter(x => x.state === LinkState.BROKEN).length,
      1
    );
    requestStub.restore();
  });

  it('should report malformed links as broken', async () => {
    const results = await check({ path: 'test/fixtures/malformed' });
    assert.ok(!results.passed);
    assert.strictEqual(
      results.links.filter(x => x.state === LinkState.BROKEN).length,
      1
    );
  });

  it('should detect broken image links', async () => {
    const results = await check({ path: 'test/fixtures/image' });
    assert.strictEqual(
      results.links.filter(x => x.state === LinkState.BROKEN).length,
      2
    );
    assert.strictEqual(
      results.links.filter(x => x.state === LinkState.OK).length,
      2
    );
  });

  it('should perform a recursive scan', async () => {
    // This test is making sure that we do a recursive scan of links,
    // but also that we don't follow links to another site
    const scope = nock('http://fake.local')
      .head('/')
      .reply(200);
    const results = await check({
      path: 'test/fixtures/recurse',
      recurse: true,
    });
    assert.strictEqual(results.links.length, 5);
    scope.done();
  });

  it('should not recurse non-html files', async () => {
    const results = await check({
      path: 'test/fixtures/scripts',
      recurse: true,
    });
    assert.strictEqual(results.links.length, 2);
  });

  it('should not follow non-http[s] links', async () => {
    const scope = nock('http://fake.local')
      .head('/')
      .reply(200);
    // includes mailto, data urls, and other
    const results = await check({ path: 'test/fixtures/protocols' });
    assert.ok(results.passed);
    assert.strictEqual(results.links.length, 6);
    assert.strictEqual(
      results.links.filter(x => x.state === LinkState.SKIPPED).length,
      4
    );
    scope.done();
  });

  it('should not recurse by default', async () => {
    const results = await check({ path: 'test/fixtures/recurse' });
    assert.strictEqual(results.links.length, 2);
  });

  it('should retry with a GET after a HEAD', async () => {
    const scopes = [
      nock('http://fake.local')
        .head('/')
        .reply(405),
      nock('http://fake.local')
        .get('/')
        .reply(200),
    ];
    const results = await check({ path: 'test/fixtures/basic' });
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
      nock('http://fake.local.br')
        .head('/deep.html')
        .reply(200),
    ];
    const results = await check({
      path: 'http://fake.local',
      recurse: true,
    });
    assert.strictEqual(results.links.length, 2);
    assert.ok(results.passed);
    scopes.forEach(x => x.done());
  });
});
