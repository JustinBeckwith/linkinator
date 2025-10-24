import fs from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { fetch as undiciFetch } from 'undici';
import { afterAll, assert, beforeAll, describe, it } from 'vitest';
import { startWebServer } from '../src/server.js';

describe('server', () => {
	let server: Server;
	let rootUrl: string;
	const contents = fs.readFileSync('test/fixtures/server/index.html', 'utf8');
	beforeAll(async () => {
		server = await startWebServer({
			directoryListing: true,
			markdown: true,
			root: 'test/fixtures/server',
		});
		const addr = server.address() as AddressInfo;
		rootUrl = `http://localhost:${addr.port}`;
	});
	afterAll(() => {
		server.destroy();
	});

	it('should serve basic file', async () => {
		const url = rootUrl;
		const response = await undiciFetch(url);
		const data = await response.text();
		assert.strictEqual(data, contents);
		const expectedContentType = 'text/html';
		assert.strictEqual(
			response.headers.get('content-type'),
			expectedContentType,
		);
	});

	it('should show a directory listing if asked nicely', async () => {
		const url = `${rootUrl}/bag/`;
		const response = await undiciFetch(url);
		const data = await response.text();
		const expected =
			'<html><body><ul><li><a href="bag.html">bag.html</a></li></ul></body></html>';
		assert.strictEqual(data, expected);
	});

	it('should serve correct mime type', async () => {
		const url = `${rootUrl}/script.js`;
		const response = await undiciFetch(url);
		const expectedContentType = 'text/javascript';
		assert.strictEqual(
			response.headers.get('content-type'),
			expectedContentType,
		);
	});

	it('should protect against path escape attacks', async () => {
		const url = `${rootUrl}/../../etc/passwd`;
		const response = await undiciFetch(url);
		assert.strictEqual(response.status, 404);
	});

	it('should return a 404 for missing paths', async () => {
		const url = `${rootUrl}/does/not/exist`;
		const response = await undiciFetch(url);
		assert.strictEqual(response.status, 404);
	});

	it('should work with directories with a .', async () => {
		const url = `${rootUrl}/5.0/`;
		const response = await undiciFetch(url);
		const data = await response.text();
		assert.strictEqual(response.status, 200);
		assert.strictEqual(data, contents);
	});

	it('should ignore query strings', async () => {
		const url = `${rootUrl}/index.html?a=b`;
		const response = await undiciFetch(url);
		const data = await response.text();
		assert.strictEqual(response.status, 200);
		assert.strictEqual(data, contents);
	});

	it('should ignore query strings in a directory', async () => {
		const url = `${rootUrl}/?a=b`;
		const response = await undiciFetch(url);
		const data = await response.text();
		assert.strictEqual(response.status, 200);
		assert.strictEqual(data, contents);
	});

	it('should handle query strings when path requires redirect to directory', async () => {
		// This reproduces issue #595 - /checkout?services=setup-cctv
		// where /checkout is a directory that should redirect to /checkout/
		const url = `${rootUrl}/checkout?services=setup-cctv`;
		const response = await undiciFetch(url);
		const data = await response.text();
		assert.strictEqual(response.status, 200);
		assert.strictEqual(data, '<html><body>Checkout page</body></html>');
	});
});

describe('server with cleanUrls', () => {
	let server: Server;
	let rootUrl: string;

	beforeAll(async () => {
		server = await startWebServer({
			root: 'test/fixtures/server/clean-urls',
			cleanUrls: true,
		});
		const addr = server.address() as AddressInfo;
		rootUrl = `http://localhost:${addr.port}`;
	});

	afterAll(() => {
		server.destroy();
	});

	it('should resolve extensionless URL to .html file', async () => {
		const url = `${rootUrl}/about`;
		const response = await undiciFetch(url);
		const data = await response.text();
		assert.strictEqual(response.status, 200);
		assert.strictEqual(
			data,
			'<html><body><h1>About Page</h1><a href="contact">Contact</a></body></html>\n',
		);
	});

	it('should resolve nested extensionless URL to .html file', async () => {
		const url = `${rootUrl}/contact`;
		const response = await undiciFetch(url);
		const data = await response.text();
		assert.strictEqual(response.status, 200);
		assert.strictEqual(
			data,
			'<html><body><h1>Contact Page</h1></body></html>\n',
		);
	});

	it('should still serve files with .html extension', async () => {
		const url = `${rootUrl}/about.html`;
		const response = await undiciFetch(url);
		const data = await response.text();
		assert.strictEqual(response.status, 200);
		assert.strictEqual(
			data,
			'<html><body><h1>About Page</h1><a href="contact">Contact</a></body></html>\n',
		);
	});

	it('should return 404 for non-existent extensionless URLs', async () => {
		const url = `${rootUrl}/nonexistent`;
		const response = await undiciFetch(url);
		assert.strictEqual(response.status, 404);
	});

	it('should serve index.html for root path', async () => {
		const url = `${rootUrl}/`;
		const response = await undiciFetch(url);
		const data = await response.text();
		assert.strictEqual(response.status, 200);
		assert.strictEqual(
			data,
			'<html><body><h1>Home Page</h1><a href="about">About</a></body></html>\n',
		);
	});

	it('should protect against path traversal with clean URLs', async () => {
		const url = `${rootUrl}/../../../etc/passwd`;
		const response = await undiciFetch(url);
		assert.strictEqual(response.status, 404);
	});
});

describe('server without cleanUrls', () => {
	let server: Server;
	let rootUrl: string;

	beforeAll(async () => {
		server = await startWebServer({
			root: 'test/fixtures/server/clean-urls',
			cleanUrls: false,
		});
		const addr = server.address() as AddressInfo;
		rootUrl = `http://localhost:${addr.port}`;
	});

	afterAll(() => {
		server.destroy();
	});

	it('should NOT resolve extensionless URL when cleanUrls is disabled', async () => {
		const url = `${rootUrl}/about`;
		const response = await undiciFetch(url);
		assert.strictEqual(response.status, 404);
	});

	it('should still serve files with .html extension', async () => {
		const url = `${rootUrl}/about.html`;
		const response = await undiciFetch(url);
		const data = await response.text();
		assert.strictEqual(response.status, 200);
		assert.strictEqual(
			data,
			'<html><body><h1>About Page</h1><a href="contact">Contact</a></body></html>\n',
		);
	});
});
