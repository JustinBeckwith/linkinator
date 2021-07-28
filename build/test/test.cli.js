"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mocha_1 = require("mocha");
const execa = require("execa");
const chai_1 = require("chai");
const http = require("http");
const util = require("util");
const stripAnsi = require("strip-ansi");
const enableDestroy = require("server-destroy");
const index_1 = require("../src/index");
// eslint-disable-next-line prefer-arrow-callback
mocha_1.describe('cli', function () {
    let server;
    this.timeout(10000);
    const pkg = require('../../package.json');
    const linkinator = pkg.bin.linkinator;
    const node = 'node';
    afterEach(async () => {
        if (server) {
            await util.promisify(server.destroy)();
        }
    });
    mocha_1.it('should show output for failures', async () => {
        const res = await execa(node, [linkinator, 'test/fixtures/basic'], {
            reject: false,
        });
        chai_1.assert.match(stripAnsi(res.stderr), /ERROR: Detected 1 broken links/);
    });
    mocha_1.it('should pass successful markdown scan', async () => {
        const res = await execa(node, [
            linkinator,
            'test/fixtures/markdown/README.md',
        ]);
        chai_1.assert.match(res.stderr, /Successfully scanned/);
    });
    mocha_1.it('should allow multiple paths', async () => {
        const res = await execa(node, [
            linkinator,
            'test/fixtures/markdown/unlinked.md',
            'test/fixtures/markdown/README.md',
        ]);
        chai_1.assert.match(res.stderr, /Successfully scanned/);
    });
    mocha_1.it('should show help if no params are provided', async () => {
        const res = await execa(node, [linkinator], {
            reject: false,
        });
        chai_1.assert.match(res.stdout, /\$ linkinator LOCATION \[ --arguments \]/);
    });
    mocha_1.it('should flag skipped links', async () => {
        const res = await execa(node, [
            linkinator,
            '--verbosity',
            'INFO',
            '--skip',
            '"LICENSE.md, unlinked.md"',
            'test/fixtures/markdown/README.md',
        ]);
        const stdout = stripAnsi(res.stdout);
        const stderr = stripAnsi(res.stderr);
        chai_1.assert.match(stdout, /\[SKP\]/);
        // make sure we don't report skipped links in the count
        chai_1.assert.match(stderr, /scanned 2 links/);
    });
    mocha_1.it('should provide CSV if asked nicely', async () => {
        const res = await execa(node, [
            linkinator,
            '--format',
            'csv',
            'test/fixtures/markdown/README.md',
        ]);
        chai_1.assert.match(res.stdout, /README.md,200,OK,/);
    });
    mocha_1.it('should provide JSON if asked nicely', async () => {
        const res = await execa(node, [
            linkinator,
            '--format',
            'json',
            'test/fixtures/markdown/README.md',
        ]);
        const output = JSON.parse(res.stdout);
        chai_1.assert.ok(output.links);
    });
    mocha_1.it('should not show links if --silent', async () => {
        const res = await execa(node, [
            linkinator,
            '--silent',
            'test/fixtures/markdown/README.md',
        ]);
        chai_1.assert.notMatch(res.stdout, /\[/);
    });
    mocha_1.it('should not show 200 links if verbosity is ERROR with JSON', async () => {
        const res = await execa(node, [
            linkinator,
            '--verbosity',
            'ERROR',
            '--format',
            'JSON',
            'test/fixtures/markdown/README.md',
        ]);
        const links = JSON.parse(res.stdout).links;
        for (const link of links) {
            chai_1.assert.strictEqual(link.state, index_1.LinkState.BROKEN);
        }
    });
    mocha_1.it('should accept a server-root', async () => {
        const res = await execa(node, [
            linkinator,
            '--markdown',
            '--server-root',
            'test/fixtures/markdown',
            'README.md',
        ]);
        chai_1.assert.match(res.stderr, /Successfully scanned/);
    });
    mocha_1.it('should accept globs', async () => {
        const res = await execa(node, [
            linkinator,
            'test/fixtures/markdown/*.md',
            'test/fixtures/markdown/**/*.md',
        ]);
        chai_1.assert.match(res.stderr, /Successfully scanned/);
    });
    mocha_1.it('should throw on invalid format', async () => {
        const res = await execa(node, [linkinator, './README.md', '--format', 'LOL'], {
            reject: false,
        });
        chai_1.assert.match(res.stderr, /FORMAT must be/);
    });
    mocha_1.it('should throw on invalid verbosity', async () => {
        const res = await execa(node, [linkinator, './README.md', '--VERBOSITY', 'LOL'], {
            reject: false,
        });
        chai_1.assert.match(res.stderr, /VERBOSITY must be/);
    });
    mocha_1.it('should throw when verbosity and silent are flagged', async () => {
        const res = await execa(node, [linkinator, './README.md', '--verbosity', 'DEBUG', '--silent'], {
            reject: false,
        });
        chai_1.assert.match(res.stderr, /The SILENT and VERBOSITY flags/);
    });
    mocha_1.it('should show no output for verbosity=NONE', async () => {
        const res = await execa(node, [linkinator, 'test/fixtures/basic', '--verbosity', 'NONE'], {
            reject: false,
        });
        chai_1.assert.strictEqual(res.exitCode, 1);
        chai_1.assert.strictEqual(res.stdout, '');
        chai_1.assert.strictEqual(res.stderr, '');
    });
    mocha_1.it('should show callstacks for verbosity=DEBUG', async () => {
        const res = await execa(node, [linkinator, 'test/fixtures/basic', '--verbosity', 'DEBUG'], {
            reject: false,
        });
        chai_1.assert.strictEqual(res.exitCode, 1);
        chai_1.assert.match(res.stdout, /reason: getaddrinfo/);
    });
    mocha_1.it('should allow passing a config', async () => {
        const res = await execa(node, [
            linkinator,
            'test/fixtures/basic',
            '--config',
            'test/fixtures/config/skip-array-config.json',
        ]);
        chai_1.assert.strictEqual(res.exitCode, 0);
    });
    mocha_1.it('should fail if a url search is provided without a replacement', async () => {
        const res = await execa(node, [linkinator, '--url-rewrite-search', 'boop', 'test/fixtures/basic'], {
            reject: false,
        });
        chai_1.assert.strictEqual(res.exitCode, 1);
        chai_1.assert.match(res.stderr, /flag must be used/);
    });
    mocha_1.it('should fail if a url replacement is provided without a search', async () => {
        const res = await execa(node, [linkinator, '--url-rewrite-replace', 'beep', 'test/fixtures/basic'], {
            reject: false,
        });
        chai_1.assert.strictEqual(res.exitCode, 1);
        chai_1.assert.match(res.stderr, /flag must be used/);
    });
    mocha_1.it('should respect url rewrites', async () => {
        const res = await execa(node, [
            linkinator,
            '--url-rewrite-search',
            'NOTLICENSE.md',
            '--url-rewrite-replace',
            'LICENSE.md',
            'test/fixtures/rewrite/README.md',
        ]);
        chai_1.assert.match(res.stderr, /Successfully scanned/);
    });
    mocha_1.it('should warn on retries', async () => {
        // start a web server to return the 429
        let requestCount = 0;
        let firstRequestTime;
        const port = 3333;
        const delayMillis = 1000;
        server = http.createServer((_, res) => {
            if (requestCount === 0) {
                res.writeHead(429, {
                    'retry-after': 1,
                });
                requestCount++;
                firstRequestTime = Date.now();
            }
            else {
                chai_1.assert.isAtLeast(Date.now(), firstRequestTime + delayMillis);
                res.writeHead(200);
            }
            res.end();
        });
        enableDestroy(server);
        await new Promise(r => server.listen(port, r));
        const res = await execa(node, [
            linkinator,
            '--retry',
            'test/fixtures/retryCLI',
        ]);
        chai_1.assert.strictEqual(res.exitCode, 0);
        chai_1.assert.include(res.stdout, `Retrying: http://localhost:${port}`);
    });
});
//# sourceMappingURL=test.cli.js.map