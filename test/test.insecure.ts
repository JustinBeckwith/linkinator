import { execa } from 'execa';
import { assert, describe, it } from 'vitest';

describe('cli', () => {
	it('should allow insecure certs', async () => {
		const response = await execa(
			'node',
			[
				'build/src/cli.js',
				'https://self-signed.badssl.com/',
				'--allow-insecure-certs',
			],
			{
				reject: false,
			},
		);
		assert.match(response.stderr, /Successfully scanned/);
	});
});
