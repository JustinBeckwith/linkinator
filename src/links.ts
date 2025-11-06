import { Readable } from 'node:stream';
import { WritableStream } from 'htmlparser2/WritableStream';
import { parseSrcset } from 'srcset';
import schemaOrgUrlFields from './schema-org-url-fields.json' with {
	type: 'json',
};

const linksAttribute: Record<string, string[]> = {
	background: ['body'],
	cite: ['blockquote', 'del', 'ins', 'q'],
	data: ['object'],
	href: ['a', 'area', 'embed', 'link'],
	icon: ['command'],
	longdesc: ['frame', 'iframe'],
	manifest: ['html'],
	content: ['meta'],
	poster: ['video'],
	pluginspage: ['embed'],
	pluginurl: ['embed'],
	src: [
		'audio',
		'embed',
		'frame',
		'iframe',
		'img',
		'input',
		'script',
		'source',
		'track',
		'video',
	],
	srcset: ['img', 'source'],
};
// Create lookup table for tag name to attribute that contains URL:
const tagAttribute: Record<string, string[]> = {};
for (const attribute of Object.keys(linksAttribute)) {
	for (const tag of linksAttribute[attribute]) {
		tagAttribute[tag] ||= [];
		tagAttribute[tag].push(attribute);
	}
}

export type ParsedUrl = {
	link: string;
	error?: Error;
	url?: URL;
	fragment?: string;
};

/**
 * Parses meta refresh content to extract the URL.
 * Meta refresh format: "0;url=https://example.com" or "0; url=https://example.com"
 * @param content The content attribute value from a meta refresh tag
 * @returns The extracted URL or null if parsing fails
 */
function parseMetaRefresh(content: string): string | null {
	// Meta refresh format: "delay;url=URL" or "delay; url=URL"
	// The delay can be any number, URL parameter can have optional spaces
	const match = content.match(/^\s*\d+\s*;\s*url\s*=\s*(.+)/i);
	if (match?.[1]) {
		return match[1].trim();
	}
	return null;
}

export async function getLinks(
	source: Readable,
	baseUrl: string,
	checkCss = false,
): Promise<ParsedUrl[]> {
	let realBaseUrl = baseUrl;
	let baseSet = false;
	const links: ParsedUrl[] = [];
	let isInStyleTag = false;
	let styleTagContent = '';
	let isJsonLd = false;
	let jsonLdContent = '';

	const parser = new WritableStream({
		onopentag(tag: string, attributes: Record<string, string>) {
			// Allow alternate base URL to be specified in tag:
			if (tag === 'base' && !baseSet) {
				realBaseUrl = getBaseUrl(attributes.href, baseUrl);
				baseSet = true;
			}

			// Track when we enter a <style> tag (only if checkCss is enabled)
			if (tag === 'style' && checkCss) {
				isInStyleTag = true;
				styleTagContent = '';
			}

			if (tag === 'script' && attributes.type === 'application/ld+json') {
				isJsonLd = true;
				jsonLdContent = '';
			}

			// ignore href properties for link tags where rel is likely to fail
			const relValuesToIgnore = ['dns-prefetch', 'preconnect'];
			if (tag === 'link' && relValuesToIgnore.includes(attributes.rel)) {
				return;
			}

			// Only for <meta content=""> tags, only validate the url if
			// the content actually looks like a url
			if (tag === 'meta' && attributes.content) {
				// Handle meta refresh redirects: <meta http-equiv="refresh" content="0;url=https://example.com">
				if (attributes['http-equiv']?.toLowerCase() === 'refresh') {
					const refreshUrl = parseMetaRefresh(attributes.content);
					if (refreshUrl) {
						links.push(parseLink(refreshUrl, realBaseUrl));
					}
					return;
				}
				try {
					new URL(attributes.content);
				} catch {
					return;
				}
			}

			// Check for inline style attribute with url() references (only if checkCss is enabled)
			if (attributes.style && checkCss) {
				const urls = extractUrlsFromCss(attributes.style);
				for (const url of urls) {
					links.push(parseLink(url, realBaseUrl));
				}
			}

			if (tagAttribute[tag]) {
				for (const attribute of tagAttribute[tag]) {
					const linkString = attributes[attribute];
					if (linkString) {
						for (const link of parseAttribute(attribute, linkString)) {
							links.push(parseLink(link, realBaseUrl));
						}
					}
				}
			}
		},
		ontext(text: string) {
			// Collect text content when inside a <style> tag
			if (isInStyleTag) {
				styleTagContent += text;
			}
			// Collect text content when inside a JSON-LD <script> tag
			if (isJsonLd) {
				jsonLdContent += text;
			}
		},
		onclosetag(tag: string) {
			// When we close a <style> tag, extract URLs from the collected CSS
			if (tag === 'style' && isInStyleTag) {
				isInStyleTag = false;
				const urls = extractUrlsFromCss(styleTagContent);
				for (const url of urls) {
					links.push(parseLink(url, realBaseUrl));
				}
				styleTagContent = '';
			}
			if (tag === 'script' && isJsonLd) {
				isJsonLd = false;
				try {
					const json = JSON.parse(jsonLdContent);
					const urls = extractLinksFromJson(json, undefined);
					for (const url of urls) {
						links.push(parseLink(url, realBaseUrl));
					}
				} catch {
					// Silently ignore JSON parsing errors
				}
				jsonLdContent = '';
			}
		},
	});
	await new Promise((resolve, reject) => {
		source.pipe(parser).on('finish', resolve).on('error', reject);
	});
	return links;
}

function getBaseUrl(htmlBaseUrl: string, oldBaseUrl: string): string {
	if (isAbsoluteUrl(htmlBaseUrl)) {
		return htmlBaseUrl;
	}

	const url = new URL(htmlBaseUrl, oldBaseUrl);
	url.hash = '';
	return url.href;
}

function isAbsoluteUrl(url: string): boolean {
	// Don't match Windows paths
	if (/^[a-zA-Z]:\\/.test(url)) {
		return false;
	}

	// Scheme: https://tools.ietf.org/html/rfc3986#section-3.1
	// Absolute URL: https://tools.ietf.org/html/rfc3986#section-4.3
	return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url);
}

function parseAttribute(name: string, value: string): string[] {
	switch (name) {
		case 'srcset': {
			// The swapping of any multiple spaces into a single space is here to
			// work around this bug:
			// https://github.com/sindresorhus/srcset/issues/14
			const strippedValue = value.replace(/\s+/, ' ');
			return parseSrcset(strippedValue).map((p) => p.url);
		}

		default: {
			return [value];
		}
	}
}

function parseLink(link: string, baseUrl: string): ParsedUrl {
	try {
		const url = new URL(link, baseUrl);
		const fragment = url.hash
			? decodeURIComponent(url.hash.slice(1))
			: undefined;
		url.hash = '';
		return { link, url, fragment };
	} catch (error) {
		return { link, error: error as Error };
	}
}

/**
 * Extracts URLs from CSS content.
 * Finds URLs in:
 * - @import rules: @import url(...) or @import "..."
 * - url() functions in property values: background: url(...)
 * @param source Readable stream of CSS content
 * @param baseUrl Base URL for resolving relative URLs
 * @returns Array of parsed URLs found in the CSS
 */
export async function getCssLinks(
	source: Readable,
	baseUrl: string,
): Promise<ParsedUrl[]> {
	const links: ParsedUrl[] = [];
	const chunks: Buffer[] = [];

	// Read the entire CSS content
	for await (const chunk of source) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	const cssContent = Buffer.concat(chunks).toString('utf-8');

	// Extract URLs from the CSS content
	const urls = extractUrlsFromCss(cssContent);

	for (const url of urls) {
		links.push(parseLink(url, baseUrl));
	}

	return links;
}

/**
 * Extracts all URLs from CSS content string.
 * Handles @import statements and url() functions.
 * @param css CSS content as string
 * @returns Array of URL strings found in the CSS
 */
function extractUrlsFromCss(css: string): string[] {
	const urls: string[] = [];

	// Remove CSS comments /* ... */
	const cleanCss = css.replace(/\/\*[\s\S]*?\*\//g, '');

	// Match @import statements
	// Formats: @import url("..."); @import url('...'); @import url(...);
	//          @import "..."; @import '...';
	const importRegex =
		/@import\s+(?:url\(\s*['"]?([^'")]+)['"]?\s*\)|['"]([^'"]+)['"])/gi;
	let match: RegExpExecArray | null;
	match = importRegex.exec(cleanCss);
	while (match !== null) {
		const url = match[1] || match[2];
		if (url) {
			urls.push(url.trim());
		}
		match = importRegex.exec(cleanCss);
	}

	// Match url() functions in CSS properties
	// Formats: url("...") url('...') url(...)
	const urlRegex = /url\(\s*['"]?([^'")]+)['"]?\s*\)/gi;
	match = urlRegex.exec(cleanCss);
	while (match !== null) {
		const url = match[1];
		if (url && !url.startsWith('data:')) {
			// Skip data URLs
			urls.push(url.trim());
		}
		match = urlRegex.exec(cleanCss);
	}

	return urls;
}

/**
 * Extracts URLs from JSON-LD content.  I took the approach of only
 * extracting URLs from known schema.org fields that are expected to contain URLs.
 * In the future, we may consider validating non-schema.org fields, or moving
 * towards a more fuzzy logic for idenfiying potential URLs.
 */
function extractLinksFromJson(json: unknown, parentKey?: string): string[] {
	const links: string[] = [];
	if (!json || typeof json !== 'object') {
		// If it's a string and we have a parentKey, check if it's a URL field
		if (
			typeof json === 'string' &&
			parentKey &&
			schemaOrgUrlFields.includes(parentKey)
		) {
			try {
				new URL(json);
				links.push(json);
			} catch (_e) {
				// Not a valid URL
			}
		}
		return links;
	}

	for (const key in json as Record<string, unknown>) {
		const value = (json as Record<string, unknown>)[key];
		if (typeof value === 'string' && schemaOrgUrlFields.includes(key)) {
			try {
				new URL(value);
				links.push(value);
			} catch (_e) {
				// Not a valid URL.
			}
		} else if (Array.isArray(value)) {
			for (const item of value) {
				links.push(...extractLinksFromJson(item, key)); // Pass the key down
			}
		} else if (typeof value === 'object') {
			links.push(...extractLinksFromJson(value, key)); // Pass the key down
		}
	}

	return links;
}

/**
 * Extracts all valid fragment identifiers from HTML.
 * Valid fragment targets include:
 * - Elements with id attribute: <div id="section">
 * - Named anchors: <a name="section">
 * @param source Readable stream of HTML content
 * @returns Set of valid fragment identifiers
 */
export async function extractFragmentIds(
	source: Readable,
): Promise<Set<string>> {
	const fragments = new Set<string>();

	const parser = new WritableStream({
		onopentag(_tag: string, attributes: Record<string, string>) {
			// Check for id attribute (most common)
			if (attributes.id) {
				fragments.add(attributes.id);
			}

			// Check for name attribute on anchors (legacy but still valid)
			if (_tag === 'a' && attributes.name) {
				fragments.add(attributes.name);
			}

			// Check for href attributes that are fragment-only links (start with #)
			// This handles GitHub-style anchors where the actual element has id="user-content-foo"
			// but the href is "#foo"
			if (_tag === 'a' && attributes.href) {
				const href = attributes.href;
				if (href.startsWith('#') && href.length > 1) {
					// Extract the fragment (removing the leading #)
					fragments.add(href.substring(1));
				}
			}
		},
	});

	await new Promise((resolve, reject) => {
		source.pipe(parser).on('finish', resolve).on('error', reject);
	});

	return fragments;
}

export type FragmentValidationResult = {
	fragment: string;
	isValid: boolean;
};

/**
 * Validates fragment identifiers against HTML content.
 * @param htmlContent The HTML content as a Buffer
 * @param fragmentsToValidate Set of fragment identifiers to validate
 * @returns Array of validation results for each fragment
 */
export async function validateFragments(
	htmlContent: Buffer,
	fragmentsToValidate: Set<string>,
): Promise<FragmentValidationResult[]> {
	// Extract valid fragment IDs from the HTML
	const fragmentStream = Readable.from([htmlContent]);
	const validFragments = await extractFragmentIds(fragmentStream);

	// Check each fragment
	const results: FragmentValidationResult[] = [];
	for (const fragment of fragmentsToValidate) {
		results.push({
			fragment,
			isValid: validFragments.has(fragment),
		});
	}

	return results;
}
