import * as assert from 'assert';
import {describe, it, before, after} from 'mocha';
import {startWebServer} from '../src/server';
import {Server} from 'http';
import {request} from 'gaxios';
import * as fs from 'fs';

describe('server', () => {
  let server: Server;
  const port = 5000 + Math.round(Math.random() * 1000);
  const rootUrl = `http://localhost:${port}`;
  const contents = fs.readFileSync('test/fixtures/server/index.html', 'utf-8');
  before(async () => {
    server = await startWebServer({
      port,
      directoryListing: true,
      markdown: true,
      root: 'test/fixtures/server',
    });
  });
  after(() => server.destroy());

  it('should serve basic file', async () => {
    const url = rootUrl;
    const res = await request({url});
    assert.strictEqual(res.data, contents);
    const expectedContentType = 'text/html';
    assert.strictEqual(res.headers['content-type'], expectedContentType);
  });

  it('should show a directory listing if asked nicely', async () => {
    const url = `${rootUrl}/bag/`;
    const res = await request({url});
    const expected =
      '<html><body><ul><li><a href="bag.html">bag.html</a></li></ul></body></html>';
    assert.strictEqual(res.data, expected);
  });

  it('should serve correct mime type', async () => {
    const url = `${rootUrl}/script.js`;
    const res = await request({url});
    const expectedContentType = 'application/javascript';
    assert.strictEqual(res.headers['content-type'], expectedContentType);
  });

  it('should protect against path escape attacks', async () => {
    const url = `${rootUrl}/../../etc/passwd`;
    const res = await request({url, validateStatus: () => true});
    assert.strictEqual(res.status, 500);
  });

  it('should return a 404 for missing paths', async () => {
    const url = `${rootUrl}/does/not/exist`;
    const res = await request({url, validateStatus: () => true});
    assert.strictEqual(res.status, 404);
  });
});
