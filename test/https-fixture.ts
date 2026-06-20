import https from 'node:https';
import type { AddressInfo } from 'node:net';
import { generate } from 'selfsigned';

export interface HttpsFixture {
	server: https.Server;
	url: string;
	close: () => Promise<void>;
}

export async function startSelfSignedHttpsServer(): Promise<HttpsFixture> {
	const pems = await generate([{ name: 'commonName', value: 'localhost' }], {
		algorithm: 'sha256',
		keySize: 2048,
		notAfterDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
		extensions: [
			{
				name: 'subjectAltName',
				altNames: [
					{ type: 2, value: 'localhost' },
					{ type: 7, ip: '127.0.0.1' },
				],
			},
		],
	});

	const server = https.createServer(
		{ key: pems.private, cert: pems.cert },
		(_request, response) => {
			response.writeHead(200, { 'Content-Type': 'text/html' });
			response.end('<html><body>Hello over TLS</body></html>');
		},
	);

	await new Promise<void>((resolve, reject) => {
		server.listen(0, '127.0.0.1', () => resolve());
		server.on('error', reject);
	});

	const address = server.address() as AddressInfo;

	return {
		server,
		url: `https://127.0.0.1:${address.port}`,
		close: () =>
			new Promise<void>((resolve, reject) => {
				server.close((error) => {
					if (error) {
						reject(error);
						return;
					}
					resolve();
				});
			}),
	};
}
