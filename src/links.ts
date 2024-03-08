import {type Readable} from 'node:stream';
import {WritableStream} from 'htmlparser2/lib/WritableStream';
import {parseSrcset} from 'srcset';

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

export async function getLinks(
	source: Readable,
	baseUrl: string,
): Promise<ParsedUrl[]> {
	let realBaseUrl = baseUrl;
	let baseSet = false;
	const links = new Array<ParsedUrl>();
	const parser = new WritableStream({
		onopentag(tag: string, attributes: Record<string, string>) {
			// Allow alternate base URL to be specified in tag:
			if (tag === 'base' && !baseSet) {
				realBaseUrl = getBaseUrl(attributes.href, baseUrl);
				baseSet = true;
			}

			// ignore href properties for link tags where rel is likely to fail
			// eslint-disable-next-line unicorn/prevent-abbreviations
			const relValuesToIgnore = ['dns-prefetch', 'preconnect'];
			if (tag === 'link' && relValuesToIgnore.includes(attributes.rel)) {
				return;
			}

			// Only for <meta content=""> tags, only validate the url if
			// the content actually looks like a url
			if (tag === 'meta' && attributes.content) {
				try {
					// eslint-disable-next-line no-new
					new URL(attributes.content);
				} catch {
					return;
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
		return {link, url};
	} catch (error) {
		return {link, error: error as Error};
	}
}
