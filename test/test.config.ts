import assert from 'assert';
import path from 'path';
import {promises as fs} from 'fs';
import {describe, it} from 'mocha';
import {getConfig, Flags} from '../src/config.js';

describe('config', () => {
  it('should allow passing no config', async () => {
    const cfg: Flags = {
      format: 'json',
      recurse: true,
      silent: true,
      skip: '🌳',
      concurrency: 22,
      timeout: 1,
    };
    const config = await getConfig(cfg);
    assert.deepStrictEqual(config, cfg);
  });

  it('should throw with a reasonable message if the path doesnt exist', async () => {
    const cfg = {
      config: '/path/does/not/exist',
    };
    await assert.rejects(getConfig(cfg), /ENOENT: no such file or directory/);
  });

  it('should allow reading from a config file', async () => {
    const configPath = path.resolve(
      'test/fixtures/config/linkinator.config.json'
    );
    const expected = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    const config = await getConfig({config: configPath});
    delete config.config;
    assert.deepStrictEqual(config, expected);
  });

  it('should merge config settings from the CLI and object', async () => {
    const configPath = path.resolve(
      'test/fixtures/config/linkinator.config.json'
    );
    const expected = JSON.parse(await fs.readFile(configPath, 'utf-8'));
    expected.skip = 'loo';
    const config = await getConfig({
      config: configPath,
      skip: 'loo',
    });
    delete config.config;
    assert.deepStrictEqual(config, expected);
  });
  it('should parse config file on passing .js config file', async () => {
    const configPath = path.resolve(
      'test/fixtures/config/linkinator.config.js'
    );
    const actualConfig = await getConfig({config: configPath});
    const expectedConfig = {
      format: 'json',
      recurse: true,
      silent: true,
      concurrency: 17,
      skip: '🌳',
      directoryListing: false,
    };
    assert.deepStrictEqual(actualConfig, expectedConfig);
  });

  it('should parse config file on passing .mjs config file', async () => {
    const configPath = path.resolve(
      'test/fixtures/config/linkinator.config.mjs'
    );
    const actualConfig = await getConfig({config: configPath});
    const expectedConfig = {
      format: 'json',
      recurse: true,
      silent: true,
      concurrency: 17,
      skip: '🌳',
      directoryListing: false,
    };
    assert.deepStrictEqual(actualConfig, expectedConfig);
  });

  it('should parse config file on passing .cjs config file', async () => {
    const configPath = path.resolve(
      'test/fixtures/config/linkinator.config.cjs'
    );
    const actualConfig = await getConfig({config: configPath});
    const expectedConfig = {
      format: 'json',
      recurse: true,
      silent: true,
      concurrency: 17,
      skip: '🌳',
      directoryListing: false,
    };
    assert.deepStrictEqual(actualConfig, expectedConfig);
  });
});
