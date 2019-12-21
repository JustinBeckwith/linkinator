import { describe, it } from 'mocha';
import * as execa from 'execa';
import { assert } from 'chai';

describe('cli', () => {
  it('should link and run a basic command', async () => {
    await execa('npm', ['link']);
    const res = await execa('npx', ['linkinator', 'test/fixtures/basic'], {
      reject: false,
    });
    assert.include(res.stderr, 'ERROR: Detected 1 broken links');
  }).timeout(60000);
});
