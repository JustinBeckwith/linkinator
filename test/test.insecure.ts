import { execa } from 'execa';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import {
	startSelfSignedHttpsServer,
	type TestHttpsServer,
} from './helpers/https-server.js';

describe('cli', () => {
	let server: TestHttpsServer;

	beforeAll(async () => {
		server = await startSelfSignedHttpsServer();
	});

	afterAll(async () => {
		await server?.close();
	});

	it('should allow insecure certs', async () => {
		const response = await execa(
			'node',
			['build/src/cli.js', server.url, '--allow-insecure-certs'],
			{
				reject: false,
			},
		);
		assert.match(response.stderr, /Successfully scanned/);
	});
});
