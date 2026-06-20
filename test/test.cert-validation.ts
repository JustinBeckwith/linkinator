import { Agent, getGlobalDispatcher, setGlobalDispatcher } from 'undici';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import { check, LinkState } from '../src/index.js';
import {
	selfSignedCertificate,
	startSelfSignedServer,
} from './fixtures/self-signed-server.js';

describe('certificate validation', () => {
	let server: Awaited<ReturnType<typeof startSelfSignedServer>>;
	let selfSignedUrl: string;

	beforeAll(async () => {
		server = await startSelfSignedServer();
		selfSignedUrl = server.url;
	});

	afterAll(async () => {
		await server.close();
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

		it('should succeed on trusted certificates', async () => {
			const originalDispatcher = getGlobalDispatcher();
			const trustedAgent = new Agent({
				connect: {
					ca: selfSignedCertificate,
				},
			});
			setGlobalDispatcher(trustedAgent);

			try {
				const results = await check({
					path: selfSignedUrl,
					recurse: false,
					allowInsecureCerts: false,
				});

				const mainPage = results.links.find(
					(link) => link.url === selfSignedUrl,
				);
				assert.ok(mainPage, 'Expected to find the main page in results');
				assert.strictEqual(
					mainPage.state,
					LinkState.OK,
					'Expected trusted cert to succeed',
				);
			} finally {
				setGlobalDispatcher(originalDispatcher);
				await trustedAgent.close();
			}
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

		it('should still work with trusted certificates', async () => {
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
				'Expected trusted cert to still work with allowInsecureCerts',
			);
		});
	});
});
