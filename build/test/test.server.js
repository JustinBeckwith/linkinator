"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const assert = require("assert");
const mocha_1 = require("mocha");
const server_1 = require("../src/server");
const gaxios_1 = require("gaxios");
const fs = require("fs");
mocha_1.describe('server', () => {
    let server;
    let rootUrl;
    const contents = fs.readFileSync('test/fixtures/server/index.html', 'utf-8');
    mocha_1.before(async () => {
        server = await server_1.startWebServer({
            directoryListing: true,
            markdown: true,
            root: 'test/fixtures/server',
        });
        const addr = server.address();
        rootUrl = `http://localhost:${addr.port}`;
    });
    mocha_1.after(() => server.destroy());
    mocha_1.it('should serve basic file', async () => {
        const url = rootUrl;
        const res = await gaxios_1.request({ url });
        assert.strictEqual(res.data, contents);
        const expectedContentType = 'text/html';
        assert.strictEqual(res.headers['content-type'], expectedContentType);
    });
    mocha_1.it('should show a directory listing if asked nicely', async () => {
        const url = `${rootUrl}/bag/`;
        const res = await gaxios_1.request({ url });
        const expected = '<html><body><ul><li><a href="bag.html">bag.html</a></li></ul></body></html>';
        assert.strictEqual(res.data, expected);
    });
    mocha_1.it('should serve correct mime type', async () => {
        const url = `${rootUrl}/script.js`;
        const res = await gaxios_1.request({ url });
        const expectedContentType = 'application/javascript';
        assert.strictEqual(res.headers['content-type'], expectedContentType);
    });
    mocha_1.it('should protect against path escape attacks', async () => {
        const url = `${rootUrl}/../../etc/passwd`;
        const res = await gaxios_1.request({ url, validateStatus: () => true });
        assert.strictEqual(res.status, 404);
    });
    mocha_1.it('should return a 404 for missing paths', async () => {
        const url = `${rootUrl}/does/not/exist`;
        const res = await gaxios_1.request({ url, validateStatus: () => true });
        assert.strictEqual(res.status, 404);
    });
    mocha_1.it('should work with directories with a .', async () => {
        const url = `${rootUrl}/5.0/`;
        const res = await gaxios_1.request({ url });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data, contents);
    });
    mocha_1.it('should ignore query strings', async () => {
        const url = `${rootUrl}/index.html?a=b`;
        const res = await gaxios_1.request({ url });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data, contents);
    });
    mocha_1.it('should ignore query strings in a directory', async () => {
        const url = `${rootUrl}/?a=b`;
        const res = await gaxios_1.request({ url });
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.data, contents);
    });
});
//# sourceMappingURL=test.server.js.map