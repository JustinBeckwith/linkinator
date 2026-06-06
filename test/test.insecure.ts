import { execa } from 'execa';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import { startSelfSignedServer } from './fixtures/self-signed-server.js';

describe('cli', () => {
	let server: Awaited<ReturnType<typeof startSelfSignedServer>>;
	let rootUrl: string;

	beforeAll(async () => {
		server = await startSelfSignedServer();
		rootUrl = server.url;
	});

	afterAll(async () => {
		await server.close();
	});

	it('should allow insecure certs', async () => {
		const response = await execa(
			'node',
			['build/src/cli.js', rootUrl, '--allow-insecure-certs'],
			{
				reject: false,
			},
		);
		assert.strictEqual(response.exitCode, 0);
		assert.match(response.stderr, /Successfully scanned/);
	});
});
