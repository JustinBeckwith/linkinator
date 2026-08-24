import { Readable } from 'node:stream';
import { assert, describe, it } from 'vitest';
import { getLinks } from '../src/links.js';

const baseUrl = 'https://example.com/';

async function linksFrom(html: string): Promise<string[]> {
	const links = await getLinks(Readable.from(html), baseUrl);
	return links.map((link) => link.url?.href ?? link.link);
}

describe('HTML link relationships', () => {
	it.each([
		'dns-prefetch preconnect',
		'PRECONNECT',
		' DnS-PrEfEtCh\tPRECONNECT\n',
		'dns-prefetch\fpreconnect\rdns-prefetch',
	])('ignores href when all rel tokens are resource hints: %j', async (rel) => {
		const links = await linksFrom(
			`<link rel="${rel}" href="https://asset-origin.example/">`,
		);
		assert.deepStrictEqual(links, []);
	});

	it.each([
		'stylesheet',
		'preconnect stylesheet',
		'dns-prefetch\tSTYLESHEET preconnect',
		'',
		'   \t\n\f\r',
		'dns-prefetch\u00a0preconnect',
	])('validates href when rel has a checkable relationship: %j', async (rel) => {
		const links = await linksFrom(
			`<link rel="${rel}" href="https://asset-origin.example/">`,
		);
		assert.deepStrictEqual(links, ['https://asset-origin.example/']);
	});

	it('validates href when rel is omitted', async () => {
		const links = await linksFrom(
			'<link href="https://asset-origin.example/">',
		);
		assert.deepStrictEqual(links, ['https://asset-origin.example/']);
	});
});
