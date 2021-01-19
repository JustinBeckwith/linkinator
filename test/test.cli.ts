import * as assert from 'assert';
import * as http from 'http';
import * as util from 'util';
import * as execa from 'execa';
import {describe, it} from 'mocha';
import enableDestroy = require('server-destroy');
import {LinkResult, LinkState} from '../src/index';

// eslint-disable-next-line prefer-arrow-callback
describe('cli', function () {
  let server: http.Server;
  this.timeout(60_000);

  if (process.env.LINKINATOR_SKIP_CLI_TESTS) {
    return;
  }

  before(async () => {
    await execa('npm', ['link']);
  });

  afterEach(async () => {
    if (server) {
      await util.promisify(server.destroy)();
    }
  });

  it('should show output for failures', async () => {
    const res = await execa('linkinator', ['test/fixtures/basic'], {
      reject: false,
    });
    assert.ok(res.stderr.includes('ERROR: Detected 1 broken links'));
  });

  it('should pass successful markdown scan', async () => {
    const res = await execa('linkinator', ['test/fixtures/markdown/README.md']);
    assert.ok(res.stderr.includes('Successfully scanned'));
  });

  it('should allow multiple paths', async () => {
    const res = await execa('linkinator', [
      'test/fixtures/markdown/unlinked.md',
      'test/fixtures/markdown/README.md',
    ]);
    assert.ok(res.stderr.includes('Successfully scanned'));
  });

  it('should show help if no params are provided', async () => {
    const res = await execa('linkinator', {
      reject: false,
    });
    assert.ok(res.stdout.includes('$ linkinator LOCATION [ --arguments ]'));
  });

  it('should flag skipped links', async () => {
    const res = await execa('linkinator', [
      '--verbosity',
      'INFO',
      '--skip',
      '"LICENSE.md, unlinked.md"',
      'test/fixtures/markdown/README.md',
    ]);
    assert.ok(res.stdout.includes('[SKP]'));
  });

  it('should provide CSV if asked nicely', async () => {
    const res = await execa('linkinator', [
      '--format',
      'csv',
      'test/fixtures/markdown/README.md',
    ]);
    assert.ok(res.stdout.includes('README.md,200,OK,'));
  });

  it('should provide JSON if asked nicely', async () => {
    const res = await execa('linkinator', [
      '--format',
      'json',
      'test/fixtures/markdown/README.md',
    ]);
    const output = JSON.parse(res.stdout);
    assert.ok(output.links);
  });

  it('should not show links if --silent', async () => {
    const res = await execa('linkinator', [
      '--silent',
      'test/fixtures/markdown/README.md',
    ]);
    assert.ok(!res.stdout.includes('['));
  });

  it('should not show 200 links if verbosity is ERROR with JSON', async () => {
    const res = await execa('linkinator', [
      '--verbosity',
      'ERROR',
      '--format',
      'JSON',
      'test/fixtures/markdown/README.md',
    ]);
    const links = JSON.parse(res.stdout).links as LinkResult[];
    for (const link of links) {
      assert.strictEqual(link.state, LinkState.BROKEN);
    }
  });

  it('should accept a server-root', async () => {
    const res = await execa('linkinator', [
      '--markdown',
      '--server-root',
      'test/fixtures/markdown',
      'README.md',
    ]);
    assert.ok(res.stderr.includes('Successfully scanned'));
  });

  it('should accept globs', async () => {
    const res = await execa('linkinator', [
      'test/fixtures/markdown/*.md',
      'test/fixtures/markdown/**/*.md',
    ]);
    assert.ok(res.stderr.includes('Successfully scanned'));
  });

  it('should throw on invalid format', async () => {
    const res = await execa('linkinator', ['./README.md', '--format', 'LOL'], {
      reject: false,
    });
    assert.ok(res.stderr.includes('FORMAT must be'));
  });

  it('should throw on invalid verbosity', async () => {
    const res = await execa(
      'linkinator',
      ['./README.md', '--VERBOSITY', 'LOL'],
      {
        reject: false,
      }
    );
    assert.ok(res.stderr.includes('VERBOSITY must be'));
  });

  it('should throw when verbosity and silent are flagged', async () => {
    const res = await execa(
      'linkinator',
      ['./README.md', '--verbosity', 'DEBUG', '--silent'],
      {
        reject: false,
      }
    );
    assert.ok(res.stderr.includes('The SILENT and VERBOSITY flags'));
  });

  it('should show no output for verbosity=NONE', async () => {
    const res = await execa(
      'linkinator',
      ['test/fixtures/basic', '--verbosity', 'NONE'],
      {
        reject: false,
      }
    );
    assert.strictEqual(res.exitCode, 1);
    assert.strictEqual(res.stdout, '');
    assert.strictEqual(res.stderr, '');
  });

  it('should show callstacks for verbosity=DEBUG', async () => {
    const res = await execa(
      'linkinator',
      ['test/fixtures/basic', '--verbosity', 'DEBUG'],
      {
        reject: false,
      }
    );
    assert.strictEqual(res.exitCode, 1);
    assert.ok(res.stdout.includes('reason: getaddrinfo'));
  });

  it('should allow passing a config', async () => {
    const res = await execa('linkinator', [
      'test/fixtures/basic',
      '--config',
      'test/fixtures/config/skip-array-config.json',
    ]);
    assert.strictEqual(res.exitCode, 0);
  });

  it('should warn on retries', async () => {
    // start a web server to return the 429
    let requestCount = 0;
    let firstRequestTime: number;
    const port = 3333;
    const delayMillis = 1000;
    server = http.createServer((_, res) => {
      if (requestCount === 0) {
        res.writeHead(429, {
          'retry-after': 1,
        });
        requestCount++;
        firstRequestTime = Date.now();
      } else {
        assert.ok(Date.now() >= firstRequestTime + delayMillis);
        res.writeHead(200);
      }
      res.end();
    });
    enableDestroy(server);
    await new Promise<void>(r => server.listen(port, r));

    const res = await execa('linkinator', [
      '--retry',
      'test/fixtures/retryCLI',
    ]);
    assert.strictEqual(res.exitCode, 0);
    assert.ok(res.stdout.includes(`Retrying: http://localhost:${port}`));
  });
});
