"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.startWebServer = void 0;
const http = require("http");
const path = require("path");
const fs = require("fs");
const util_1 = require("util");
const marked = require("marked");
const mime = require("mime");
const url_1 = require("url");
const escape = require("escape-html");
const enableDestroy = require("server-destroy");
const readFile = util_1.promisify(fs.readFile);
const stat = util_1.promisify(fs.stat);
const readdir = util_1.promisify(fs.readdir);
/**
 * Spin up a local HTTP server to serve static requests from disk
 * @private
 * @returns Promise that resolves with the instance of the HTTP server
 */
async function startWebServer(options) {
    const root = path.resolve(options.root);
    return new Promise((resolve, reject) => {
        const server = http
            .createServer((req, res) => handleRequest(req, res, root, options))
            .listen(options.port || 0, () => resolve(server))
            .on('error', reject);
        if (!options.port) {
            const addr = server.address();
            options.port = addr.port;
        }
        enableDestroy(server);
    });
}
exports.startWebServer = startWebServer;
async function handleRequest(req, res, root, options) {
    var _a;
    const url = new url_1.URL(req.url || '/', `http://localhost:${options.port}`);
    const pathParts = url.pathname.split('/').filter(x => !!x);
    const originalPath = path.join(root, ...pathParts);
    if (url.pathname.endsWith('/')) {
        pathParts.push('index.html');
    }
    const localPath = path.join(root, ...pathParts);
    if (!localPath.startsWith(root)) {
        res.writeHead(500);
        res.end();
        return;
    }
    const maybeListing = options.directoryListing && localPath.endsWith(`${path.sep}index.html`);
    try {
        const stats = await stat(localPath);
        const isDirectory = stats.isDirectory();
        if (isDirectory) {
            // this means we got a path with no / at the end!
            const doc = "<html><body>Redirectin'</body></html>";
            res.statusCode = 301;
            res.setHeader('Content-Type', 'text/html; charset=UTF-8');
            res.setHeader('Content-Length', Buffer.byteLength(doc));
            res.setHeader('Location', req.url + '/');
            res.end(doc);
            return;
        }
    }
    catch (err) {
        if (!maybeListing) {
            return return404(res, err);
        }
    }
    try {
        let data = await readFile(localPath, { encoding: 'utf8' });
        let mimeType = mime.getType(localPath);
        const isMarkdown = (_a = req.url) === null || _a === void 0 ? void 0 : _a.toLocaleLowerCase().endsWith('.md');
        if (isMarkdown && options.markdown) {
            data = marked(data, { gfm: true });
            mimeType = 'text/html; charset=UTF-8';
        }
        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Length', Buffer.byteLength(data));
        res.writeHead(200);
        res.end(data);
    }
    catch (err) {
        if (maybeListing) {
            try {
                const files = await readdir(originalPath);
                const fileList = files
                    .filter(f => escape(f))
                    .map(f => `<li><a href="${f}">${f}</a></li>`)
                    .join('\r\n');
                const data = `<html><body><ul>${fileList}</ul></body></html>`;
                res.writeHead(200);
                res.end(data);
                return;
            }
            catch (err) {
                return return404(res, err);
            }
        }
        else {
            return return404(res, err);
        }
    }
}
function return404(res, err) {
    res.writeHead(404);
    res.end(JSON.stringify(err));
}
//# sourceMappingURL=server.js.map