import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import { check, LinkState } from '../src/index.js';
import {
	type HttpsFixture,
	startSelfSignedHttpsServer,
} from './https-fixture.js';

describe('certificate validation', () => {
	let fixture: HttpsFixture;

	beforeAll(async () => {
		fixture = await startSelfSignedHttpsServer();
	});

	afterAll(async () => {
		await fixture.close();
	});

	describe('with allowInsecureCerts disabled (default)', () => {
		it('should fail on self-signed certificates', async () => {
			const results = await check({
				path: fixture.url,
				recurse: false,
				allowInsecureCerts: false,
			});

			const mainPage = results.links.find((link) => {
				try {
					return new URL(link.url).origin === fixture.url;
				} catch {
					return false;
				}
			});
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
				path: fixture.url,
				recurse: false,
				allowInsecureCerts: true,
			});

			const mainPage = results.links.find((link) => {
				try {
					return new URL(link.url).origin === fixture.url;
				} catch {
					return false;
				}
			});
			assert.ok(mainPage, 'Expected to find the main page in results');
			assert.strictEqual(
				mainPage.state,
				LinkState.OK,
				'Expected self-signed cert to be accepted with allowInsecureCerts',
			);
		});
	});
});
