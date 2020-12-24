import {describe, it} from 'mocha';
import * as execa from 'execa';
import {assert} from 'chai';

describe('cli', () => {
  before(async () => {
    //await execa('npm', ['link']);
  });

  it('should show output for failures', async () => {
    const res = await execa('npx', ['linkinator', 'test/fixtures/basic'], {
      reject: false,
    });
    assert.include(res.stderr, 'ERROR: Detected 1 broken links');
  });

  it('should pass successful markdown scan', async () => {
    const res = await execa('npx', [
      'linkinator',
      'test/fixtures/markdown/README.md',
    ]);
    assert.include(res.stderr, 'Successfully scanned');
  });

  it('should allow multiple paths', async () => {
    const res = await execa('npx', [
      'linkinator',
      'test/fixtures/markdown/unlinked.md',
      'test/fixtures/markdown/README.md',
    ]);
    assert.include(res.stderr, 'Successfully scanned');
  });

  it('should show help if no params are provided', async () => {
    const res = await execa('npx', ['linkinator'], {
      reject: false,
    });
    assert.include(res.stdout, '$ linkinator LOCATION [ --arguments ]');
  });

  it('should flag skipped links', async () => {
    const res = await execa('npx', [
      'linkinator',
      '--verbosity',
      'INFO',
      '--skip',
      'LICENSE.md',
      'test/fixtures/markdown/README.md',
    ]);
    assert.include(res.stdout, '[SKP]');
  });

  it('should provide CSV if asked nicely', async () => {
    const res = await execa('npx', [
      'linkinator',
      '--markdown',
      '--format',
      'csv',
      'test/fixtures/markdown/README.md',
    ]);
    assert.include(res.stdout, '/README.md,200,OK,');
  });

  it('should provide JSON if asked nicely', async () => {
    const res = await execa('npx', [
      'linkinator',
      '--markdown',
      '--format',
      'json',
      'test/fixtures/markdown/README.md',
    ]);
    assert.include(res.stdout, '{');
  });

  it('should not show links if --silent', async () => {
    const res = await execa('npx', [
      'linkinator',
      '--silent',
      'test/fixtures/markdown/README.md',
    ]);
    assert.strictEqual(res.stdout.indexOf('['), -1);
  });

  it('should accept a server-root', async () => {
    const res = await execa('npx', [
      'linkinator',
      '--markdown',
      '--server-root',
      'test/fixtures/markdown',
      'README.md',
    ]);
    assert.ok(res.stderr.includes('Successfully scanned'));
  });

  it('should accept globs', async () => {
    const res = await execa('npx', [
      'linkinator',
      'test/fixtures/markdown/*.md',
      'test/fixtures/markdown/**/*.md',
    ]);
    assert.ok(res.stderr.includes('Successfully scanned'));
  });

  it('should throw on invalid format', async () => {
    const res = await execa(
      'npx',
      ['linkinator', './README.md', '--format', 'LOL'],
      {
        reject: false,
      }
    );
    assert.include(res.stderr, 'FORMAT must be');
  });

  it('should throw on invalid format', async () => {
    const res = await execa(
      'npx',
      ['linkinator', './README.md', '--format', 'LOL'],
      {
        reject: false,
      }
    );
    assert.include(res.stderr, 'FORMAT must be');
  });

  it('should throw on invalid verbosity', async () => {
    const res = await execa(
      'npx',
      ['linkinator', './README.md', '--VERBOSITY', 'LOL'],
      {
        reject: false,
      }
    );
    assert.include(res.stderr, 'VERBOSITY must be');
  });

  it('should throw when verbosity and silent are flagged', async () => {
    const res = await execa(
      'npx',
      ['linkinator', './README.md', '--verbosity', 'DEBUG', '--silent'],
      {
        reject: false,
      }
    );
    assert.include(res.stderr, 'The SILENT and VERBOSITY flags');
  });

  it('should show no output for verbosity=NONE', async () => {
    const res = await execa(
      'npx',
      ['linkinator', 'test/fixtures/basic', '--verbosity', 'NONE'],
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
      'npx',
      ['linkinator', 'test/fixtures/basic', '--verbosity', 'DEBUG'],
      {
        reject: false,
      }
    );
    assert.strictEqual(res.exitCode, 1);
    assert.ok(/reason: getaddrinfo ENOTFOUND fake.local/.test(res.stdout));
  });
});
