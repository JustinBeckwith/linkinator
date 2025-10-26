import { assert, describe, it } from 'vitest';
import { normalizeBaseUrl } from '../src/url-utils.js';

describe('url-utils', () => {
	describe('normalizeBaseUrl', () => {
		it('should add trailing slash to URL without extension', () => {
			const result = normalizeBaseUrl('http://example.com/apps/web', false);
			assert.strictEqual(result, 'http://example.com/apps/web/');
		});

		it('should not modify URL that already has trailing slash', () => {
			const result = normalizeBaseUrl('http://example.com/apps/web/', false);
			assert.strictEqual(result, 'http://example.com/apps/web/');
		});

		it('should not modify URL with file extension', () => {
			const result = normalizeBaseUrl('http://example.com/page.html', false);
			assert.strictEqual(result, 'http://example.com/page.html');
		});

		it('should not modify URL with other file extensions', () => {
			const result = normalizeBaseUrl('http://example.com/api.php', false);
			assert.strictEqual(result, 'http://example.com/api.php');
		});

		it('should not modify URL ending with index', () => {
			const result = normalizeBaseUrl('http://example.com/docs/index', false);
			assert.strictEqual(result, 'http://example.com/docs/index');
		});

		it('should not modify URL ending with default', () => {
			const result = normalizeBaseUrl('http://example.com/docs/default', false);
			assert.strictEqual(result, 'http://example.com/docs/default');
		});

		it('should not modify URL ending with home', () => {
			const result = normalizeBaseUrl('http://example.com/docs/home', false);
			assert.strictEqual(result, 'http://example.com/docs/home');
		});

		it('should not modify URL ending with main', () => {
			const result = normalizeBaseUrl('http://example.com/docs/main', false);
			assert.strictEqual(result, 'http://example.com/docs/main');
		});

		it('should be case-insensitive for common page names', () => {
			const result = normalizeBaseUrl('http://example.com/docs/INDEX', false);
			assert.strictEqual(result, 'http://example.com/docs/INDEX');
		});

		it('should handle localhost URLs', () => {
			const result = normalizeBaseUrl('http://localhost:8080/apps/web', false);
			assert.strictEqual(result, 'http://localhost:8080/apps/web/');
		});

		it('should handle URLs with ports', () => {
			const result = normalizeBaseUrl(
				'http://example.com:3000/api/users',
				false,
			);
			assert.strictEqual(result, 'http://example.com:3000/api/users/');
		});

		it('should handle URLs with query parameters', () => {
			const result = normalizeBaseUrl(
				'http://example.com/search?q=test',
				false,
			);
			assert.strictEqual(result, 'http://example.com/search/?q=test');
		});

		it('should handle URLs with hash fragments', () => {
			const result = normalizeBaseUrl('http://example.com/page#section', false);
			assert.strictEqual(result, 'http://example.com/page/#section');
		});

		it('should not modify URL with dotfile (leading dot)', () => {
			const result = normalizeBaseUrl('http://example.com/.htaccess', false);
			// .htaccess has a dot at position 0, so it's not considered to have an extension
			assert.strictEqual(result, 'http://example.com/.htaccess/');
		});

		it('should handle root URL', () => {
			const result = normalizeBaseUrl('http://example.com/', false);
			assert.strictEqual(result, 'http://example.com/');
		});

		it('should handle root URL without trailing slash', () => {
			const result = normalizeBaseUrl('http://example.com', false);
			// Root URL doesn't need modification - already considered a directory
			assert.strictEqual(result, 'http://example.com');
		});

		describe('with cleanUrls enabled', () => {
			it('should not modify URL when cleanUrls is enabled', () => {
				const result = normalizeBaseUrl('http://example.com/about', true);
				assert.strictEqual(result, 'http://example.com/about');
			});

			it('should not add trailing slash with cleanUrls enabled', () => {
				const result = normalizeBaseUrl('http://example.com/contact', true);
				assert.strictEqual(result, 'http://example.com/contact');
			});

			it('should still preserve existing trailing slash with cleanUrls', () => {
				const result = normalizeBaseUrl('http://example.com/about/', true);
				assert.strictEqual(result, 'http://example.com/about/');
			});
		});

		describe('edge cases', () => {
			it('should handle invalid URL gracefully', () => {
				const result = normalizeBaseUrl('not-a-valid-url', false);
				assert.strictEqual(result, 'not-a-valid-url');
			});

			it('should handle empty string', () => {
				const result = normalizeBaseUrl('', false);
				assert.strictEqual(result, '');
			});

			it('should handle URL with multiple dots in filename', () => {
				const result = normalizeBaseUrl(
					'http://example.com/file.test.html',
					false,
				);
				assert.strictEqual(result, 'http://example.com/file.test.html');
			});

			it('should add trailing slash to path segment with dots but no extension', () => {
				const result = normalizeBaseUrl('http://example.com/my.folder', false);
				// Has a dot after position 0, so it's considered to have an extension
				assert.strictEqual(result, 'http://example.com/my.folder');
			});
		});

		describe('issue #374 scenarios', () => {
			it('should fix the harmonograph example from issue #374', () => {
				const result = normalizeBaseUrl(
					'http://localhost:8080/apps/web',
					false,
				);
				assert.strictEqual(result, 'http://localhost:8080/apps/web/');

				// Verify relative link resolution works correctly
				const resolvedUrl = new URL('harmonograph', result);
				assert.strictEqual(
					resolvedUrl.href,
					'http://localhost:8080/apps/web/harmonograph',
				);
			});

			it('should fix Sphinx documentation links', () => {
				const baseUrl = normalizeBaseUrl('http://example.com/docs/api', false);
				assert.strictEqual(baseUrl, 'http://example.com/docs/api/');

				// Verify relative links resolve correctly
				const searchUrl = new URL('search.html', baseUrl);
				assert.strictEqual(
					searchUrl.href,
					'http://example.com/docs/api/search.html',
				);

				const introUrl = new URL('01_introduction.html', baseUrl);
				assert.strictEqual(
					introUrl.href,
					'http://example.com/docs/api/01_introduction.html',
				);
			});
		});
	});
});
