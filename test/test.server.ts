import assert from 'assert';
import {describe, it, before, after} from 'mocha';
import {startWebServer} from '../src/server.js';
import {AddressInfo} from 'net';
import {Server} from 'http';
import {request} from 'undici';
import fs from 'fs';

describe('server', () => {
  let server: Server;
  let rootUrl: string;
  const contents = fs.readFileSync('test/fixtures/server/index.html', 'utf-8');
  before(async () => {
    server = await startWebServer({
      directoryListing: true,
      markdown: true,
      root: 'test/fixtures/server',
    });
    const addr = server.address() as AddressInfo;
    rootUrl = `http://localhost:${addr.port}`;
  });
  after(() => server.destroy());

  it('should serve basic file', async () => {
    const url = rootUrl;
    const res = await request(url);
    const data = await res.body.text();
    assert.strictEqual(data, contents);
    const expectedContentType = 'text/html';
    assert.strictEqual(res.headers['content-type'], expectedContentType);
  });

  it('should show a directory listing if asked nicely', async () => {
    const url = `${rootUrl}/bag/`;
    const res = await request(url);
    const expected =
      '<html><body><ul><li><a href="bag.html">bag.html</a></li></ul></body></html>';
    const data = await res.body.text();
    assert.strictEqual(data, expected);
  });

  it('should serve correct mime type', async () => {
    const url = `${rootUrl}/script.js`;
    const res = await request(url);
    const expectedContentType = 'application/javascript';
    assert.strictEqual(res.headers['content-type'], expectedContentType);
  });

  it('should protect against path escape attacks', async () => {
    const url = `${rootUrl}/../../etc/passwd`;
    const res = await request(url);
    assert.strictEqual(res.statusCode, 404);
  });

  it('should return a 404 for missing paths', async () => {
    const url = `${rootUrl}/does/not/exist`;
    const res = await request(url);
    assert.strictEqual(res.statusCode, 404);
  });

  it('should work with directories with a .', async () => {
    const url = `${rootUrl}/5.0/`;
    const res = await request(url);
    const data = await res.body.text();
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(data, contents);
  });

  it('should ignore query strings', async () => {
    const url = `${rootUrl}/index.html?a=b`;
    const res = await request(url);
    const data = await res.body.text();
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(data, contents);
  });

  it('should ignore query strings in a directory', async () => {
    const url = `${rootUrl}/?a=b`;
    const res = await request(url);
    const data = await res.body.text();
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(data, contents);
  });
});
