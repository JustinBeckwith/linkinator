import { Stream } from 'node:stream';
import { WritableStream } from 'htmlparser2/WritableStream';
import { parseSrcset } from 'srcset';
import type { ElementMetadata } from './types.js';

type TagConfig = {
	urlAttrs: string[];
	captureText?: boolean;
	attributeKey?: string;
};

const tagConfigs: Record<string, TagConfig> = {
	a: { urlAttrs: ['href'], captureText: true },
	area: { urlAttrs: ['href'] },
	audio: { urlAttrs: ['src'] },
	blockquote: { urlAttrs: ['cite'], captureText: true },
	body: { urlAttrs: ['background'] },
	command: { urlAttrs: ['icon'] },
	del: { urlAttrs: ['cite'], captureText: true },
	embed: { urlAttrs: ['href', 'pluginspage', 'pluginurl', 'src'] },
	frame: { urlAttrs: ['longdesc', 'src'] },
	html: { urlAttrs: ['manifest'] },
	iframe: { urlAttrs: ['longdesc', 'src'] },
	img: { urlAttrs: ['src', 'srcset'], attributeKey: 'alt' },
	input: { urlAttrs: ['src'] },
	ins: { urlAttrs: ['cite'], captureText: true },
	link: { urlAttrs: ['href'] },
	meta: { urlAttrs: ['content'] },
	object: { urlAttrs: ['data'] },
	q: { urlAttrs: ['cite'], captureText: true },
	script: { urlAttrs: ['src'] },
	source: { urlAttrs: ['src', 'srcset'] },
	track: { urlAttrs: ['src'] },
	video: { urlAttrs: ['poster', 'src'] },
};

export type ParsedUrl = {
	link: string;
	error?: Error;
	url?: URL;
	metadata?: ElementMetadata;
};

export async function getLinks(
	source: ReadableStream,
	baseUrl: string,
): Promise<ParsedUrl[]> {
	let realBaseUrl = baseUrl;
	let baseSet = false;

	// Tracks all open tags that have text to be captured
	let activeTextCapture: { tag: string; parsed: ParsedUrl }[] = [];

	const links: ParsedUrl[] = [];

	const parser = new WritableStream({
		onopentag(tag: string, attributes: Record<string, string>) {
			// Allow alternate base URL to be specified in tag:
			if (tag === 'base' && !baseSet && attributes.href) {
				realBaseUrl = getBaseUrl(attributes.href, baseUrl);
				baseSet = true;
			}

			// ignore href properties for link tags where rel is likely to fail
			const relValuesToIgnore = ['dns-prefetch', 'preconnect'];
			if (tag === 'link' && relValuesToIgnore.includes(attributes.rel)) {
				return;
			}

			// Only for <meta content=""> tags, only validate the url if
			// the content actually looks like a url
			if (tag === 'meta' && attributes.content) {
				try {
					new URL(attributes.content);
				} catch {
					return;
				}
			}

			const cfg = tagConfigs[tag];
			// Nothing to do for this tag
			if (!cfg) {
				return;
			}

			// Iterate over tag attributes that could contain URLs
			for (const attr of cfg.urlAttrs) {
				const raw = attributes[attr];
				if (!raw) {
					continue;
				}

				for (const parsedAttribute of parseAttribute(attr, raw)) {
					const parsedUrl = parseLink(parsedAttribute, realBaseUrl);
					parsedUrl.metadata = {
						tag,
					};

					// Use specified attribute to identify element
					if (cfg.attributeKey && attributes[cfg.attributeKey]) {
						parsedUrl.metadata[cfg.attributeKey] = attributes[cfg.attributeKey];
					}

					// Add element to array of currently open tags to capture following inner text
					if (cfg.captureText) {
						parsedUrl.metadata.text = '';
						activeTextCapture.push({
							tag,
							parsed: parsedUrl,
						});
					}

					links.push(parsedUrl);
				}
			}
		},
		ontext(data) {
			// Add text to all currently open tags
			for (const entry of activeTextCapture) {
				if (entry.parsed.metadata) {
					entry.parsed.metadata.text += data.trim();
				}
			}
		},
		onclosetag(tag) {
			// Remove now closed tag from array of opened tags
			activeTextCapture = activeTextCapture.filter((e) => e.tag !== tag);
		},
	});
	await new Promise((resolve, reject) => {
		Stream.Readable.fromWeb(source as import('stream/web').ReadableStream)
			.pipe(parser)
			.on('finish', resolve)
			.on('error', reject);
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
			return parseSrcset(value).map((p) => p.url);
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
