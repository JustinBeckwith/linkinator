import { Buffer } from 'node:buffer';
import { promises as fs } from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import escapeHtml from 'escape-html';
import { marked } from 'marked';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import mime from 'mime';

// Configure marked to generate GitHub-style heading IDs for fragment validation
marked.use(gfmHeadingId());

export type WebServerOptions = {
	// The local path that should be mounted as a static web server
	root: string;
	// The port on which to start the local web server
	port?: number;
	// If markdown should be automatically compiled and served
	markdown?: boolean;
	// Should directories automatically serve an inde page
	directoryListing?: boolean;
	// Enable clean URLs (e.g., /about resolves to /about.html)
	cleanUrls?: boolean;
};

/**
 * Spin up a local HTTP server to serve static requests from disk
 * @private
 * @returns Promise that resolves with the instance of the HTTP server
 */
export async function startWebServer(options: WebServerOptions) {
	const root = path.resolve(options.root);
	return new Promise<http.Server>((resolve, reject) => {
		const server = http
			.createServer(async (request, response) =>
				handleRequest(request, response, root, options),
			)
			.listen(options.port || 0, () => {
				resolve(server);
			})
			.on('error', reject);
		if (!options.port) {
			const addr = server.address() as AddressInfo;
			options.port = addr.port;
		}
	});
}

/**
 * Stop the given web server
 * @param server The server instance to stop
 * @returns Promise that resolves when the server is fully stopped
 */
export async function stopWebServer(server: http.Server) {
	return new Promise<void>((resolve, reject) => {
		server.close((err) => {
			if (err) {
				reject(err);
			} else {
				resolve();
			}
		});
		server.closeAllConnections();
	});
}

async function handleRequest(
	request: http.IncomingMessage,
	response: http.ServerResponse,
	root: string,
	options: WebServerOptions,
) {
	const url = new URL(request.url || '/', `http://localhost:${options.port}`);
	const pathParts = url.pathname
		.split('/')
		.filter(Boolean)
		.map(decodeURIComponent);
	const originalPath = path.join(root, ...pathParts);
	if (url.pathname.endsWith('/')) {
		pathParts.push('index.html');
	}

	const localPath = path.join(root, ...pathParts);
	if (!localPath.startsWith(root)) {
		response.writeHead(500);
		response.end();
		return;
	}

	const maybeListing =
		options.directoryListing && localPath.endsWith(`${path.sep}index.html`);

	try {
		const stats = await fs.stat(localPath);
		const isDirectory = stats.isDirectory();
		if (isDirectory) {
			// This means we got a path with no / at the end!
			// Create a proper redirect URL that preserves query parameters
			// Fix for issue #595 - thanks to @maddsua for the solution in PR #596
			const redirectUrl = new URL(url);
			if (!redirectUrl.pathname.endsWith('/')) {
				redirectUrl.pathname += '/';
			}

			const document = "<html><body>Redirectin'</body></html>";
			response.statusCode = 301;
			response.setHeader('Content-Type', 'text/html; charset=UTF-8');
			response.setHeader('Content-Length', Buffer.byteLength(document));
			response.setHeader('Location', redirectUrl.href);
			response.end(document);
			return;
		}
	} catch (error) {
		const error_ = error as Error;
		// Try clean URLs: if file not found and cleanUrls is enabled, try adding .html
		if (options.cleanUrls && !localPath.endsWith('.html')) {
			try {
				const htmlPath = `${localPath}.html`;
				// Verify it's still within the root directory (security check)
				if (htmlPath.startsWith(root)) {
					const htmlStats = await fs.stat(htmlPath);
					if (!htmlStats.isDirectory()) {
						// File exists! Serve it with the original URL
						const data = await fs.readFile(htmlPath, { encoding: 'utf8' });
						const mimeType = 'text/html; charset=UTF-8';
						response.setHeader('Content-Type', mimeType);
						response.setHeader('Content-Length', Buffer.byteLength(data));
						response.writeHead(200);
						response.end(data);
						return;
					}
				}
			} catch {
				// Fall through to normal 404 handling
			}
		}
		if (!maybeListing) {
			return404(response, error_);
			return;
		}
	}

	try {
		let data = await fs.readFile(localPath, { encoding: 'utf8' });
		let mimeType = mime.getType(localPath);
		const isMarkdown = request.url?.toLocaleLowerCase().endsWith('.md');
		if (isMarkdown && options.markdown) {
			const markedData = marked(data, { gfm: true });
			if (typeof markedData === 'string') {
				data = markedData;
			} else if (
				(typeof markedData === 'object' || typeof markedData === 'function') &&
				typeof markedData.then === 'function'
			) {
				data = await markedData;
			}

			mimeType = 'text/html; charset=UTF-8';
		}

		response.setHeader('Content-Type', mimeType || '');
		response.setHeader('Content-Length', Buffer.byteLength(data));
		response.writeHead(200);
		response.end(data);
	} catch (error) {
		if (maybeListing) {
			try {
				const files = await fs.readdir(originalPath);
				const fileList = files
					.filter((f) => escapeHtml(f))
					.map((f) => `<li><a href="${f}">${f}</a></li>`)
					.join('\r\n');
				const data = `<html><body><ul>${fileList}</ul></body></html>`;
				response.writeHead(200);
				response.end(data);
			} catch (error_) {
				const error__ = error_ as Error;
				return404(response, error__);
			}
		} else {
			const error_ = error as Error;
			return404(response, error_);
		}
	}
}

function return404(response: http.ServerResponse, error: Error) {
	response.writeHead(404);
	response.end(JSON.stringify(error));
}
