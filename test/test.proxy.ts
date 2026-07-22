import http from 'node:http';
import type { AddressInfo } from 'node:net';
import net from 'node:net';
import { afterEach, assert, beforeEach, describe, it, vi } from 'vitest';
import { check, resetSharedAgents } from '../src/index.js';

describe('proxy', () => {
	let targetServer: http.Server;
	let proxyServer: http.Server;
	let targetUrl: string;
	let proxyUrl: string;
	let proxiedHosts: string[];

	beforeEach(async () => {
		proxiedHosts = [];
		for (const name of [
			'http_proxy',
			'HTTP_PROXY',
			'https_proxy',
			'HTTPS_PROXY',
			'no_proxy',
			'NO_PROXY',
		]) {
			vi.stubEnv(name, undefined);
		}

		// Target server: serves a simple HTML page with no outbound links
		targetServer = http.createServer((_req, res) => {
			res.writeHead(200, { 'Content-Type': 'text/html' });
			res.end('<html><body>Hello</body></html>');
		});
		await new Promise<void>((resolve, reject) => {
			targetServer.listen(0, () => resolve());
			targetServer.on('error', reject);
		});
		const targetAddr = targetServer.address() as AddressInfo;
		targetUrl = `http://127.0.0.1:${targetAddr.port}`;

		// Proxy server: undici's ProxyAgent tunnels all traffic via HTTP CONNECT,
		// even for plain HTTP targets. The proxy records the tunneled host:port,
		// then splices the client and target sockets together.
		proxyServer = http.createServer();
		proxyServer.on('connect', (req, clientSocket, head) => {
			proxiedHosts.push(req.url ?? '');

			const [hostname, portStr] = (req.url ?? '').split(':');
			const port = Number(portStr) || 80;
			const targetSocket = net.connect(port, hostname, () => {
				clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
				if (head.length > 0) targetSocket.write(head);
				targetSocket.pipe(clientSocket);
				clientSocket.pipe(targetSocket);
			});
			targetSocket.on('error', () => clientSocket.destroy());
			clientSocket.on('error', () => targetSocket.destroy());
		});
		await new Promise<void>((resolve, reject) => {
			proxyServer.listen(0, () => resolve());
			proxyServer.on('error', reject);
		});
		const proxyAddr = proxyServer.address() as AddressInfo;
		proxyUrl = `http://127.0.0.1:${proxyAddr.port}`;
	});

	afterEach(async () => {
		vi.unstubAllEnvs();
		resetSharedAgents();
		await new Promise<void>((resolve) => targetServer.close(() => resolve()));
		await new Promise<void>((resolve) => proxyServer.close(() => resolve()));
	});

	it('should route requests through http_proxy', async () => {
		vi.stubEnv('http_proxy', proxyUrl);

		const results = await check({ path: targetUrl });

		assert.ok(results.passed);
		assert.ok(
			proxiedHosts.length > 0,
			'At least one request should have gone through the proxy',
		);
	});

	it('should route requests through HTTP_PROXY', async () => {
		vi.stubEnv('HTTP_PROXY', proxyUrl);

		const results = await check({ path: targetUrl });

		assert.ok(results.passed);
		assert.ok(
			proxiedHosts.length > 0,
			'At least one request should have gone through the proxy',
		);
	});

	it('should route requests through https_proxy', async () => {
		vi.stubEnv('https_proxy', proxyUrl);

		const results = await check({ path: targetUrl });

		assert.ok(results.passed);
		assert.ok(
			proxiedHosts.length > 0,
			'At least one request should have gone through the proxy',
		);
	});

	it('should route requests through HTTPS_PROXY', async () => {
		vi.stubEnv('HTTPS_PROXY', proxyUrl);

		const results = await check({ path: targetUrl });

		assert.ok(results.passed);
		assert.ok(
			proxiedHosts.length > 0,
			'At least one request should have gone through the proxy',
		);
	});

	it('should bypass proxy when no proxy env vars are set', async () => {
		// Explicitly clear all proxy env vars to guard against a developer's
		// local environment having them set
		vi.stubEnv('http_proxy', '');
		vi.stubEnv('HTTP_PROXY', '');
		vi.stubEnv('https_proxy', '');
		vi.stubEnv('HTTPS_PROXY', '');

		const results = await check({ path: targetUrl });

		assert.ok(results.passed);
		assert.strictEqual(
			proxiedHosts.length,
			0,
			'Proxy should not have been contacted when env vars are unset',
		);
	});

	it('should honor no_proxy', async () => {
		vi.stubEnv('http_proxy', proxyUrl);
		vi.stubEnv('no_proxy', '127.0.0.1');

		const results = await check({ path: targetUrl });

		assert.ok(results.passed);
		assert.strictEqual(
			proxiedHosts.length,
			0,
			'Proxy should not be contacted for hosts in no_proxy',
		);
	});

	it('should honor NO_PROXY', async () => {
		vi.stubEnv('HTTP_PROXY', proxyUrl);
		vi.stubEnv('NO_PROXY', '127.0.0.1');

		const results = await check({ path: targetUrl });

		assert.ok(results.passed);
		assert.strictEqual(
			proxiedHosts.length,
			0,
			'Proxy should not be contacted for hosts in NO_PROXY',
		);
	});

	it('should still use the proxy when NO_PROXY does not match', async () => {
		vi.stubEnv('HTTP_PROXY', proxyUrl);
		vi.stubEnv('NO_PROXY', 'example.com');

		const results = await check({ path: targetUrl });

		assert.ok(results.passed);
		assert.ok(
			proxiedHosts.length > 0,
			'Non-matching NO_PROXY entries should not disable the proxy',
		);
	});

	it('should bypass the proxy for local file scans excluded by NO_PROXY', async () => {
		vi.stubEnv('HTTP_PROXY', proxyUrl);
		vi.stubEnv('NO_PROXY', '127.0.0.1');

		const results = await check({
			path: 'test/fixtures/local',
			recurse: true,
		});

		assert.ok(results.passed);
		assert.strictEqual(
			proxiedHosts.length,
			0,
			'The internal static server should not be contacted through the proxy',
		);
	});
});
