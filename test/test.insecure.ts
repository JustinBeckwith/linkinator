import { execa } from 'execa';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import {
	type HttpsFixture,
	startSelfSignedHttpsServer,
} from './https-fixture.js';

describe('cli', () => {
	let fixture: HttpsFixture;

	beforeAll(async () => {
		fixture = await startSelfSignedHttpsServer();
	});

	afterAll(async () => {
		await fixture.close();
	});

	it('should allow insecure certs', async () => {
		const response = await execa(
			'node',
			['build/src/cli.js', fixture.url, '--allow-insecure-certs'],
			{
				reject: false,
			},
		);
		assert.match(response.stderr, /Successfully scanned/);
	});
});
