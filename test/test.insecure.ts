import fs from 'node:fs';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { execa } from 'execa';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';

describe('cli', () => {
	let server: https.Server;
	let selfSignedUrl: string;

	beforeAll(async () => {
		server = https.createServer(
			{
				cert: fs.readFileSync(
					'test/fixtures/cert-validation/self-signed-cert.pem',
				),
				key: fs.readFileSync(
					'test/fixtures/cert-validation/self-signed-key.pem',
				),
			},
			(_req, res) => {
				res.writeHead(200, { 'Content-Type': 'text/html' });
				res.end('<html><body>self-signed cli test page</body></html>');
			},
		);

		await new Promise<void>((resolve) => {
			server.listen(0, '127.0.0.1', () => {
				const addr = server.address() as AddressInfo;
				selfSignedUrl = `https://127.0.0.1:${addr.port}/`;
				resolve();
			});
		});
	});

	afterAll(async () => {
		await new Promise<void>((resolve, reject) => {
			server.close((err) => {
				if (err) {
					reject(err);
					return;
				}
				resolve();
			});
		});
	});

	it('should allow insecure certs', async () => {
		const response = await execa(
			'node',
			['build/src/cli.js', selfSignedUrl, '--allow-insecure-certs'],
			{
				reject: false,
			},
		);
		assert.strictEqual(response.exitCode, 0);
		assert.match(response.stderr, /Successfully scanned/);
	});
});
