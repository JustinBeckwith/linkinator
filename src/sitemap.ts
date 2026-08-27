import { Readable } from 'node:stream';
import { StringDecoder } from 'node:string_decoder';
import { createGunzip } from 'node:zlib';
import { SaxesParser } from './saxes-parser.cjs';

export type ParsedSitemap = {
	type: 'index' | 'urlset';
	locations: string[];
};

export class SitemapXmlError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'SitemapXmlError';
	}
}

async function decodeSitemapSource(source: Readable): Promise<Readable> {
	const iterator = source[Symbol.asyncIterator]();
	const leadingChunks: Buffer[] = [];
	let leadingLength = 0;
	while (leadingLength < 2) {
		const next = await iterator.next();
		if (next.done) {
			break;
		}
		const chunk = Buffer.isBuffer(next.value)
			? next.value
			: Buffer.from(next.value);
		leadingChunks.push(chunk);
		leadingLength += chunk.length;
	}

	async function* replayChunks() {
		try {
			for (const chunk of leadingChunks) {
				yield chunk;
			}
			for (;;) {
				const next = await iterator.next();
				if (next.done) {
					return;
				}
				yield next.value;
			}
		} finally {
			await iterator.return?.();
		}
	}

	const replay = Readable.from(replayChunks());
	const signature = Buffer.concat(leadingChunks, leadingLength).subarray(0, 2);
	if (signature[0] !== 0x1f || signature[1] !== 0x8b) {
		return replay;
	}

	const gunzip = createGunzip();
	replay.on('error', (error) => gunzip.destroy(error));
	return replay.pipe(gunzip);
}

/** Parse a sitemap URL set or sitemap index from an XML stream. */
export async function parseSitemap(source: Readable): Promise<ParsedSitemap> {
	const elements: string[] = [];
	const locations: string[] = [];
	let rootElement: string | undefined;
	let locationText = '';
	const decoder = new StringDecoder('utf8');
	const parser = new SaxesParser({ xmlns: true });

	parser.on('opentag', (tag) => {
		const element = tag.local.toLowerCase();
		rootElement ??= element;
		if (
			elements.length === 1 &&
			((rootElement === 'urlset' && element === 'sitemap') ||
				(rootElement === 'sitemapindex' && element === 'url'))
		) {
			throw new SitemapXmlError(
				`Invalid <${element}> entry inside <${rootElement}>.`,
			);
		}
		elements.push(element);
		if (element === 'loc') {
			locationText = '';
		}
	});
	const appendText = (text: string) => {
		if (elements.at(-1) === 'loc') {
			locationText += text;
		}
	};
	parser.on('text', appendText);
	parser.on('cdata', appendText);
	parser.on('closetag', (tag) => {
		const element = tag.local.toLowerCase();
		if (element === 'loc') {
			const parent = elements.at(-2);
			const grandparent = elements.at(-3);
			const expectedParent =
				rootElement === 'urlset'
					? 'url'
					: rootElement === 'sitemapindex'
						? 'sitemap'
						: undefined;
			if (
				(parent === 'url' || parent === 'sitemap') &&
				(parent !== expectedParent || grandparent !== rootElement)
			) {
				throw new SitemapXmlError(
					`Invalid <${parent}> entry inside <${rootElement}>.`,
				);
			}
			if (parent === expectedParent && grandparent === rootElement) {
				const location = locationText.trim();
				if (location) {
					locations.push(location);
				}
			}
			locationText = '';
		}
		elements.pop();
	});
	parser.on('error', (error) => {
		throw new SitemapXmlError(error.message, { cause: error });
	});

	const decodedSource = await decodeSitemapSource(source);
	try {
		for await (const chunk of decodedSource) {
			parser.write(
				decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
			);
		}
		parser.write(decoder.end()).close();
	} catch (error) {
		if (error instanceof SitemapXmlError) {
			throw error;
		}
		throw error;
	}

	if (rootElement !== 'urlset' && rootElement !== 'sitemapindex') {
		throw new SitemapXmlError(
			`Expected a sitemap <urlset> or <sitemapindex> root element, but found ${
				rootElement ? `<${rootElement}>` : 'an empty document'
			}`,
		);
	}

	return {
		type: rootElement === 'sitemapindex' ? 'index' : 'urlset',
		locations,
	};
}
