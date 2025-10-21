import type { Readable } from 'node:stream';
import { WritableStream } from 'htmlparser2/WritableStream';
import { parseSrcset } from 'srcset';

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
): Promise<ParsedUrl[]> {
	let realBaseUrl = baseUrl;
	let baseSet = false;
	const links: ParsedUrl[] = [];
	let isInStyleTag = false;
	let styleTagContent = '';

	const parser = new WritableStream({
		onopentag(tag: string, attributes: Record<string, string>) {
			// Allow alternate base URL to be specified in tag:
			if (tag === 'base' && !baseSet) {
				realBaseUrl = getBaseUrl(attributes.href, baseUrl);
				baseSet = true;
			}

			// Track when we enter a <style> tag
			if (tag === 'style') {
				isInStyleTag = true;
				styleTagContent = '';
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

			// Check for inline style attribute with url() references
			if (attributes.style) {
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
		url.hash = '';
		return { link, url };
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
