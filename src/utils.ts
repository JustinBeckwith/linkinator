import * as path from 'node:path';
import { LinkChecker } from './crawler.js';
import type { CheckOptions, InternalCheckOptions } from './options.js';

/**
 * Convenience method to perform a scan.
 * @param options CheckOptions to be passed on
 */
export async function check(options: CheckOptions) {
	const checker = new LinkChecker();
	const results = await checker.check(options);
	return results;
}

/**
 * Checks to see if a given source is HTML.
 * @param {object} response Page response.
 * @returns {boolean}
 */
export function isHtml(response: Response): boolean {
	const contentType = response.headers.get('content-type') ?? '';
	return (
		Boolean(/text\/html/g.test(contentType)) ||
		Boolean(/application\/xhtml\+xml/g.test(contentType))
	);
}

/**
 * When running a local static web server for the user, translate paths from
 * the Url generated back to something closer to a local filesystem path.
 * @example
 *    http://localhost:0000/test/route/README.md => test/route/README.md
 * @param url The url that was checked
 * @param options Original CheckOptions passed into the client
 */
export function mapUrl<T extends string | undefined>(
	url: T,
	options?: InternalCheckOptions,
): T {
	if (!url) {
		return url;
	}

	let newUrl = url as string;

	// Trim the starting http://localhost:0000 if we stood up a local static server
	if (
		options?.staticHttpServerHost?.length &&
		url?.startsWith(options.staticHttpServerHost)
	) {
		newUrl = url.slice(options.staticHttpServerHost.length);

		// Add the full filesystem path back if we trimmed it
		if (options?.syntheticServerRoot?.length) {
			newUrl = path.join(options.syntheticServerRoot, newUrl);
		}

		if (newUrl === '') {
			newUrl = `.${path.sep}`;
		}
	}

	return newUrl as T;
}
