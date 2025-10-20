import { assert, describe, it } from 'vitest';
import { check, LinkState } from '../src/index.js';

describe('certificate validation', () => {
	describe('with allowInsecureCerts disabled (default)', () => {
		it('should fail on self-signed certificates', async () => {
			// Using badssl.com which provides various certificate scenarios
			const results = await check({
				path: 'https://self-signed.badssl.com/',
				recurse: false,
				allowInsecureCerts: false,
			});

			// The link should be broken due to certificate error
			const mainPage = results.links.find((link) => {
				try {
					return new URL(link.url).hostname === 'self-signed.badssl.com';
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

		it('should succeed on valid certificates', async () => {
			// Test a site with a valid certificate
			const results = await check({
				path: 'https://www.google.com/',
				recurse: false,
				allowInsecureCerts: false,
			});

			const mainPage = results.links.find((link) => {
				try {
					return new URL(link.url).hostname === 'www.google.com';
				} catch {
					return false;
				}
			});
			assert.ok(mainPage, 'Expected to find the main page in results');
			assert.strictEqual(
				mainPage.state,
				LinkState.OK,
				'Expected valid cert to succeed',
			);
		});
	});

	describe('with allowInsecureCerts enabled', () => {
		it('should accept self-signed certificates', async () => {
			// Using badssl.com which provides various certificate scenarios
			const results = await check({
				path: 'https://self-signed.badssl.com/',
				recurse: false,
				allowInsecureCerts: true,
			});

			// The link should be OK when ignoring cert errors
			const mainPage = results.links.find((link) => {
				try {
					return new URL(link.url).hostname === 'self-signed.badssl.com';
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

		it('should still work with valid certificates', async () => {
			// Test a site with a valid certificate
			const results = await check({
				path: 'https://www.google.com/',
				recurse: false,
				allowInsecureCerts: true,
			});

			const mainPage = results.links.find((link) => {
				try {
					return new URL(link.url).hostname === 'www.google.com';
				} catch {
					return false;
				}
			});
			assert.ok(mainPage, 'Expected to find the main page in results');
			assert.strictEqual(
				mainPage.state,
				LinkState.OK,
				'Expected valid cert to still work with allowInsecureCerts',
			);
		});
	});
});
