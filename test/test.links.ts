import { Readable } from 'node:stream';
import { assert, describe, expect, it } from 'vitest';
import { getLinks } from '../src/links.js';

const linkRelationshipBaseUrl = 'https://example.com/';

async function linksFrom(html: string): Promise<string[]> {
	const links = await getLinks(Readable.from(html), linkRelationshipBaseUrl);
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

const metaRefreshBaseUrl = 'https://base.example/root/index.html';

function metaRefresh(content: string): Readable {
	const escapedContent = content
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;');
	return Readable.from(
		`<meta http-equiv="refresh" content="${escapedContent}">`,
	);
}

describe('meta refresh links', () => {
	it.each([
		{
			name: 'single-quoted root-relative URL',
			content: "0; URL='/target'",
			link: '/target',
			url: 'https://base.example/target',
		},
		{
			name: 'double-quoted absolute URL',
			content: '0; URL="https://other.example/absolute"',
			link: 'https://other.example/absolute',
			url: 'https://other.example/absolute',
		},
		{
			name: 'whitespace and mixed-case URL parameter',
			content: "  5 ;  uRl  =  'relative/path'  ",
			link: 'relative/path',
			url: 'https://base.example/root/relative/path',
		},
		{
			name: 'query, fragment, and semicolons inside quotes',
			content: "0; URL='/search;path?one=1&two=2;three=3#part;four' ignored",
			link: '/search;path?one=1&two=2;three=3#part;four',
			url: 'https://base.example/search;path?one=1&two=2;three=3#part;four',
		},
		{
			name: 'unmatched opening single quote',
			content: "0; URL='/unmatched?q=value#fragment",
			link: '/unmatched?q=value#fragment',
			url: 'https://base.example/unmatched?q=value#fragment',
		},
		{
			name: 'unmatched opening double quote',
			content: '0; URL="relative-unmatched',
			link: 'relative-unmatched',
			url: 'https://base.example/root/relative-unmatched',
		},
		{
			name: 'existing unquoted format',
			content: '0;url=/plain;path?q=one;two#part;three',
			link: '/plain;path?q=one;two#part;three',
			url: 'https://base.example/plain;path?q=one;two#part;three',
		},
	])('extracts $name', async ({ content, link, url }) => {
		const links = await getLinks(metaRefresh(content), metaRefreshBaseUrl);

		expect(links).toHaveLength(1);
		expect(links[0]).toMatchObject({ link, urlWithFragment: url });
	});

	it.each([
		['missing delay', 'url=/target'],
		['missing separator', '0 url=/target'],
		['missing URL parameter', '0; href=/target'],
		['missing target', '0; url='],
	])('ignores malformed content with %s', async (_name, content) => {
		const links = await getLinks(metaRefresh(content), metaRefreshBaseUrl);

		expect(links).toEqual([]);
	});
});
