import fs from 'node:fs';
import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import { check, LinkState } from '../src/index.js';

describe('certificate validation', () => {
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
				res.end('<html><body>self-signed test page</body></html>');
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

	describe('with allowInsecureCerts disabled (default)', () => {
		it('should fail on self-signed certificates', async () => {
			const results = await check({
				path: selfSignedUrl,
				recurse: false,
				allowInsecureCerts: false,
			});

			const mainPage = results.links.find((link) => link.url === selfSignedUrl);
			assert.ok(mainPage, 'Expected to find the main page in results');
			assert.strictEqual(
				mainPage.state,
				LinkState.BROKEN,
				'Expected self-signed cert to be rejected',
			);
		});
	});

	describe('with allowInsecureCerts enabled', () => {
		it('should accept self-signed certificates', async () => {
			const results = await check({
				path: selfSignedUrl,
				recurse: false,
				allowInsecureCerts: true,
			});

			const mainPage = results.links.find((link) => link.url === selfSignedUrl);
			assert.ok(mainPage, 'Expected to find the main page in results');
			assert.strictEqual(
				mainPage.state,
				LinkState.OK,
				'Expected self-signed cert to be accepted with allowInsecureCerts',
			);
		});
	});
});
