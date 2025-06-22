import assert from 'node:assert';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, it } from 'mocha';
import { type Flags, getConfig } from '../src/config.js';

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

		await assert.rejects(
			getConfig({ config: '/path.dot/does/not/exist' }),
			/ENOENT: no such file or directory/,
		);
	});

	it('should throw a reasonable message if invalid extension is passed', async () => {
		await assert.rejects(
			getConfig({ config: 'invalid_extension.cfg' }),
			/Config file should be either of extensions/,
		);
	});

	it('should merge config settings from the CLI and object', async () => {
		const configPath = path.resolve(
			'test/fixtures/config/linkinator.config.json',
		);
		const expected = JSON.parse(await fs.readFile(configPath, 'utf8')) as Flags;
		expected.skip = 'loo';
		const config = await getConfig({
			config: configPath,
			skip: 'loo',
		});
		delete config.config;
		assert.deepStrictEqual(config, expected);
	});

	describe('json config file', () => {
		it('should parse a json config file with absolute path', async () => {
			const configPath = path.resolve(
				'test/fixtures/config/linkinator.config.json',
			);

			const expected = JSON.parse(
				await fs.readFile(configPath, 'utf8'),
			) as Flags;
			const config = await getConfig({ config: configPath });
			delete config.config;

			assert.deepStrictEqual(config, expected);
		});

		it('should parse a json config file with relative path', async () => {
			const configPath = 'test/fixtures/config/linkinator.config.json';
			const expected = JSON.parse(
				await fs.readFile(configPath, 'utf8'),
			) as Flags;
			const config = await getConfig({ config: configPath });
			delete config.config;

			assert.deepStrictEqual(config, expected);
		});

		it('should throw with reasonable message if json file is in invalid format ', async () => {
			const configPath = 'test/fixtures/config/linkinator.config.invalid.json';
			await assert.rejects(
				getConfig({ config: configPath }),
				/SyntaxError:.+in JSON/,
			);
		});
	});

	describe('js config file', () => {
		it('should import .js config file with relative path', async () => {
			const configPath = 'test/fixtures/config/linkinator.config.js';
			const actualConfig = await getConfig({ config: configPath });
			const expectedConfig = {
				format: 'json',
				recurse: true,
				silent: true,
				concurrency: 17,
				skip: '🌛',
				directoryListing: false,
			};
			delete actualConfig.config;

			assert.deepStrictEqual(actualConfig, expectedConfig);
		});

		it('should import .js config file with absolute path', async () => {
			const configPath = path.resolve(
				'test/fixtures/config/linkinator.config.js',
			);
			const actualConfig = await getConfig({ config: configPath });
			const expectedConfig = {
				format: 'json',
				recurse: true,
				silent: true,
				concurrency: 17,
				skip: '🌛',
				directoryListing: false,
			};
			delete actualConfig.config;

			assert.deepStrictEqual(actualConfig, expectedConfig);
		});
	});

	describe('.mjs config file', () => {
		it('should import .mjs config file with relative path', async () => {
			const configPath = 'test/fixtures/config/linkinator.config.mjs';
			const actualConfig = await getConfig({ config: configPath });
			const expectedConfig = {
				format: 'json',
				recurse: true,
				silent: true,
				concurrency: 17,
				skip: '🪐',
				directoryListing: false,
			};
			delete actualConfig.config;

			assert.deepStrictEqual(actualConfig, expectedConfig);
		});

		it('should import .mjs config with absolute path', async () => {
			const configPath = path.resolve(
				'test/fixtures/config/linkinator.config.mjs',
			);
			const actualConfig = await getConfig({ config: configPath });
			const expectedConfig = {
				format: 'json',
				recurse: true,
				silent: true,
				concurrency: 17,
				skip: '🪐',
				directoryListing: false,
			};
			delete actualConfig.config;

			assert.deepStrictEqual(actualConfig, expectedConfig);
		});
	});

	describe('.cjs config file', () => {
		it('should import cjs config with relative path', async () => {
			const configPath = 'test/fixtures/config/linkinator.config.cjs';
			const actualConfig = await getConfig({ config: configPath });
			const expectedConfig = {
				format: 'json',
				recurse: true,
				silent: true,
				concurrency: 17,
				skip: '🌊',
				directoryListing: false,
			};
			delete actualConfig.config;

			assert.deepStrictEqual(actualConfig, expectedConfig);
		});

		it('should import cjs config with absolute path', async () => {
			const configPath = path.resolve(
				'test/fixtures/config/linkinator.config.cjs',
			);
			const actualConfig = await getConfig({ config: configPath });
			const expectedConfig = {
				format: 'json',
				recurse: true,
				silent: true,
				concurrency: 17,
				skip: '🌊',
				directoryListing: false,
			};
			delete actualConfig.config;

			assert.deepStrictEqual(actualConfig, expectedConfig);
		});
	});
});
