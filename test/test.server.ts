import assert from 'node:assert';
import fs from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'mocha';
import { startWebServer } from '../src/server.js';

describe('server', () => {
	let server: Server;
	let rootUrl: string;
	const contents = fs.readFileSync('test/fixtures/server/index.html', 'utf8');
	before(async () => {
		server = await startWebServer({
			directoryListing: true,
			markdown: true,
			root: 'test/fixtures/server',
		});
		const addr = server.address() as AddressInfo;
		rootUrl = `http://localhost:${addr.port}`;
	});
	after(() => {
		server.destroy();
	});

	it('should serve basic file', async () => {
		const url = rootUrl;
		const response = await fetch(url);
		assert.strictEqual(await response.text(), contents);
		const expectedContentType = 'text/html';
		assert.strictEqual(
			response.headers.get('content-type'),
			expectedContentType,
		);
	});

	it('should show a directory listing if asked nicely', async () => {
		const url = `${rootUrl}/bag/`;
		const response = await fetch(url);
		const expected =
			'<html><body><ul><li><a href="bag.html">bag.html</a></li></ul></body></html>';
		assert.strictEqual(await response.text(), expected);
	});

	it('should serve correct mime type', async () => {
		const url = `${rootUrl}/script.js`;
		const response = await fetch(url);
		const expectedContentType = 'text/javascript';
		assert.strictEqual(
			response.headers.get('content-type'),
			expectedContentType,
		);
	});

	it('should protect against path escape attacks', async () => {
		const url = `${rootUrl}/../../etc/passwd`;
		const response = await fetch(url);
		assert.strictEqual(response.status, 404);
	});

	it('should return a 404 for missing paths', async () => {
		const url = `${rootUrl}/does/not/exist`;
		const response = await fetch(url);
		assert.strictEqual(response.status, 404);
	});

	it('should work with directories with a .', async () => {
		const url = `${rootUrl}/5.0/`;
		const response = await fetch(url);
		assert.strictEqual(response.status, 200);
		assert.strictEqual(await response.text(), contents);
	});

	it('should ignore query strings', async () => {
		const url = `${rootUrl}/index.html?a=b`;
		const response = await fetch(url);
		assert.strictEqual(response.status, 200);
		assert.strictEqual(await response.text(), contents);
	});

	it('should ignore query strings in a directory', async () => {
		const url = `${rootUrl}/?a=b`;
		const response = await fetch(url);
		assert.strictEqual(response.status, 200);
		assert.strictEqual(await response.text(), contents);
	});
});
