import { Readable } from 'node:stream';
import { assert, describe, expect, it } from 'vitest';
import { getCssLinks, getLinks } from '../src/links.js';

describe('link extraction regressions (#922)', () => {
	const baseUrl = 'https://example.com/site/index.html';

	it.each([
		['<base target="_blank">', baseUrl],
		[
			'<base target="_blank"><base href="/other/">',
			'https://example.com/other/',
		],
		['<base href=""><base href="/other/">', baseUrl],
		['<base><base target="_self">', baseUrl],
		['<base href><base href="/other/">', baseUrl],
		[
			'<base href="../assets/"><base href="/ignored/">',
			'https://example.com/assets/',
		],
	])('uses the first base with an href: %s', async (base, expected) => {
		const links = await getLinks(
			Readable.from(`${base}<a href="#top">top</a><a href="?x=1">query</a>`),
			baseUrl,
		);
		expect(links.map((link) => link.urlWithFragment)).toEqual([
			`${expected}#top`,
			`${expected}?x=1`,
		]);
	});

	it.each([
		['100%', '100%'],
		['bad%ZZ', 'bad%ZZ'],
		['%E0%A4', '%E0%A4'],
		['hello%20world', 'hello world'],
		['100%25', '100%'],
		['%E2%9C%93', '✓'],
		['%25ZZ', '%ZZ'],
		['hello%20world%', 'hello%20world%'],
		['%FF', '%FF'],
	])('accepts fragment #%s', async (hash, fragment) => {
		const [link] = await getLinks(
			Readable.from(`<a href="#${hash}">link</a>`),
			baseUrl,
		);
		expect(link.error).toBeUndefined();
		expect(link.url?.href).toBe(baseUrl);
		expect(link.urlWithFragment).toBe(`${baseUrl}#${hash}`);
		expect(link.fragment).toBe(fragment);
	});

	it.each([
		'url("img(1).png")',
		"url('img(1).png')",
		'url( "img(1).png" )',
		'@import url("img(1).png");',
		"@import url('img(1).png');",
		'@import "img(1).png";',
		"@import 'img(1).png';",
		'@IMPORT URL(\n"img(1).png"\n) screen;',
	])('preserves parentheses in quoted CSS: %s', async (css) => {
		const links = await getCssLinks(Readable.from(css), baseUrl);
		expect(links.length).toBeGreaterThan(0);
		for (const link of links) {
			expect(link.link).toBe('img(1).png');
			expect(link.url?.href).toBe('https://example.com/site/img(1).png');
		}
	});

	it.each([
		['a { background: url(plain.png) }', ['plain.png']],
		['a { background: url( plain.png ) }', ['plain.png']],
		['@import url(plain.css);', ['plain.css', 'plain.css']],
		['@import "plain.css" screen;', ['plain.css']],
		["@import 'plain.css' print;", ['plain.css']],
		['url("it\'s(1).png")', ["it's(1).png"]],
		["url('say\"hi(1).png')", ['say"hi(1).png']],
		['@import "it\'s(1).css";', ["it's(1).css"]],
		["@import 'say\"hi(1).css';", ['say"hi(1).css']],
		[
			'url("first(1).png"), url(\'second(2).png\')',
			['first(1).png', 'second(2).png'],
		],
		['/* url("ignored(1).png") */ url("kept(2).png")', ['kept(2).png']],
		['url("data:image/png;base64,AAAA")', []],
		["url('data:image/png;base64,AAAA')", []],
		['url(data:image/png;base64,AAAA)', []],
		['url("") url(\'\') url()', []],
		['url("mismatched.png\')', []],
		['url("unterminated.png)', []],
		['@import "mismatched.css\';', []],
	] satisfies [
		string,
		string[],
	][])('extracts only complete CSS references: %s', async (css, expected) => {
		const links = await getCssLinks(Readable.from(css), baseUrl);
		expect(links.map((link) => link.link)).toEqual(expected);
	});

	it('preserves quoted URLs in style tags and inline styles', async () => {
		const links = await getLinks(
			Readable.from(
				`<style>a { background: url("img(1).png") }</style><div style="background: url('img(2).png')"></div>`,
			),
			baseUrl,
			true,
		);
		expect(links.map((link) => link.link)).toEqual([
			'img(1).png',
			'img(2).png',
		]);
	});
});

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
