import {describe, it} from 'mocha';
import * as execa from 'execa';
import {assert} from 'chai';

describe('cli', () => {
  before(async () => {
    await execa('npm', ['link']);
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
      '--markdown',
      'test/fixtures/markdown/README.md',
    ]);
    assert.include(res.stdout, 'Successfully scanned');
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
      '--markdown',
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

  it('should not show links if --silent', async () => {
    const res = await execa('npx', [
      'linkinator',
      '--markdown',
      '--silent',
      'test/fixtures/markdown/README.md',
    ]);
    assert.strictEqual(res.stdout.indexOf('['), -1);
  });
});
