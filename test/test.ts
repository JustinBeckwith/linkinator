import * as assert from 'assert';
import * as nock from 'nock';
import {check, LinkState} from '../src';

nock.disableNetConnect();
nock.enableNetConnect('localhost:1234');

describe('linkinator', () => {
  async function performScan() {
    const scope = nock('http://fake.local').get('/').reply(200);
    const results = await check(
        {port: 1234, path: 'test/fixtures', linksToSkip: ['http://very.bad']});
    return {scope, results};
  }

  afterEach(() => {
    nock.cleanAll();
  });

  it('should perform a basic shallow scan', async () => {
    const {scope, results} = await performScan();
    assert.ok(results.passed);
    scope.done();
  });

  it('should skip links if asked nicely', async () => {
    const {scope, results} = await performScan();
    assert.ok(results.passed);
    assert.strictEqual(
        results.links.filter(x => x.state === LinkState.SKIPPED).length, 1);
    scope.done();
  });
});
