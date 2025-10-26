/**
 * Normalizes a base URL for proper relative link resolution.
 *
 * When an HTML document URL doesn't have a trailing slash and doesn't have a file
 * extension, browsers treat relative links as resolving from the current directory.
 * However, the URL constructor treats the last segment as a filename, causing
 * relative links to resolve from the parent directory instead.
 *
 * This function adds a trailing slash to URLs that should be treated as directories,
 * ensuring relative URLs like "page" resolve to "/current/page" instead of "/page".
 *
 * @param baseUrl - The base URL to normalize
 * @param cleanUrls - Whether clean URLs mode is enabled (e.g., /about -> about.html)
 * @returns The normalized base URL with trailing slash if appropriate
 *
 * @example
 * ```typescript
 * // Without clean URLs
 * normalizeBaseUrl('http://example.com/apps/web', false)
 * // Returns: 'http://example.com/apps/web/'
 *
 * normalizeBaseUrl('http://example.com/index', false)
 * // Returns: 'http://example.com/index' (common page name, no change)
 *
 * normalizeBaseUrl('http://example.com/page.html', false)
 * // Returns: 'http://example.com/page.html' (has extension, no change)
 *
 * // With clean URLs enabled
 * normalizeBaseUrl('http://example.com/about', true)
 * // Returns: 'http://example.com/about' (clean URLs treats this as a file)
 * ```
 */
export function normalizeBaseUrl(
	baseUrl: string,
	cleanUrls: boolean = false,
): string {
	// Skip normalization when cleanUrls is enabled, since that feature explicitly
	// treats extensionless URLs as files (e.g., /about -> about.html)
	if (cleanUrls) {
		return baseUrl;
	}

	try {
		const url = new URL(baseUrl);
		const pathname = url.pathname;

		// Already has trailing slash, no change needed
		if (pathname.endsWith('/')) {
			return baseUrl;
		}

		const lastSegment = pathname.split('/').pop() || '';

		// Check if the last segment has a file extension (e.g., .html, .php)
		// A dot at position 0 is not an extension (e.g., .htaccess)
		const hasExtension =
			lastSegment.includes('.') && lastSegment.indexOf('.') > 0;

		// Don't add trailing slash to common page filenames
		// These are typically actual files, not directories
		const isCommonPageName = ['index', 'default', 'home', 'main'].includes(
			lastSegment.toLowerCase(),
		);

		// Only add trailing slash if it's likely a directory (no extension, not a common page name)
		if (!hasExtension && !isCommonPageName) {
			url.pathname = `${pathname}/`;
			return url.href;
		}

		return baseUrl;
	} catch {
		// If URL parsing fails, return the original URL unchanged
		return baseUrl;
	}
}
