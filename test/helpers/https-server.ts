import fs from 'node:fs';
import https from 'node:https';
import type { AddressInfo } from 'node:net';

const key = fs.readFileSync(
	new URL('../fixtures/certs/localhost-key.pem', import.meta.url),
);
const cert = fs.readFileSync(
	new URL('../fixtures/certs/localhost-cert.pem', import.meta.url),
);

export type TestHttpsServer = {
	url: string;
	close: () => Promise<void>;
};

export async function startSelfSignedHttpsServer(): Promise<TestHttpsServer> {
	const server = https.createServer({ key, cert }, (_req, res) => {
		res.writeHead(200, { 'Content-Type': 'text/html' });
		res.end('<html><body>secure local fixture</body></html>');
	});

	await new Promise<void>((resolve, reject) => {
		server.once('error', reject);
		server.listen(0, () => {
			server.off('error', reject);
			resolve();
		});
	});

	const address = server.address() as AddressInfo;

	return {
		url: `https://127.0.0.1:${address.port}/`,
		close: () =>
			new Promise<void>((resolve, reject) => {
				server.close((err) => {
					if (err) {
						reject(err);
						return;
					}
					resolve();
				});
			}),
	};
}
