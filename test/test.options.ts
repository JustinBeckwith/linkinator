import path from 'node:path';
import { assert, describe, expect, it } from 'vitest';
import { findCommonPathRoot } from '../src/options.js';

describe('options', () => {
	it('finds the common root when one absolute path is an ancestor', async () => {
		const directoryPath = path.resolve('test/fixtures/relative');
		assert.strictEqual(
			await findCommonPathRoot([
				path.join(directoryPath, 'nested/nested.html'),
				directoryPath,
			]),
			directoryPath,
		);
	});

	it('rejects absolute paths on different Windows filesystems', async () => {
		await expect(
			findCommonPathRoot(
				['C:\\workspace\\one.md', 'D:\\workspace\\two.md'],
				path.win32,
			),
		).rejects.toThrow(/same filesystem/);
	});
});
