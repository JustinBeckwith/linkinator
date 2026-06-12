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
export declare function normalizeBaseUrl(baseUrl: string, cleanUrls?: boolean): string;
