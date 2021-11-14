import {AddressInfo} from 'net';
import http from 'http';
import path from 'path';
import {promises as fs} from 'fs';
import {marked} from 'marked';
import mime from 'mime';
import {URL} from 'url';
import escape from 'escape-html';
import enableDestroy from 'server-destroy';

export interface WebServerOptions {
  // The local path that should be mounted as a static web server
  root: string;
  // The port on which to start the local web server
  port?: number;
  // If markdown should be automatically compiled and served
  markdown?: boolean;
  // Should directories automatically serve an inde page
  directoryListing?: boolean;
}

/**
 * Spin up a local HTTP server to serve static requests from disk
 * @private
 * @returns Promise that resolves with the instance of the HTTP server
 */
export async function startWebServer(options: WebServerOptions) {
  const root = path.resolve(options.root);
  return new Promise<http.Server>((resolve, reject) => {
    const server = http
      .createServer((req, res) => handleRequest(req, res, root, options))
      .listen(options.port || 0, () => resolve(server))
      .on('error', reject);
    if (!options.port) {
      const addr = server.address() as AddressInfo;
      options.port = addr.port;
    }
    enableDestroy(server);
  });
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  root: string,
  options: WebServerOptions
) {
  const url = new URL(req.url || '/', `http://localhost:${options.port}`);
  const pathParts = url.pathname.split('/').filter(x => !!x);
  const originalPath = path.join(root, ...pathParts);
  if (url.pathname.endsWith('/')) {
    pathParts.push('index.html');
  }
  const localPath = path.join(root, ...pathParts);
  if (!localPath.startsWith(root)) {
    res.writeHead(500);
    res.end();
    return;
  }
  const maybeListing =
    options.directoryListing && localPath.endsWith(`${path.sep}index.html`);

  try {
    const stats = await fs.stat(localPath);
    const isDirectory = stats.isDirectory();
    if (isDirectory) {
      // this means we got a path with no / at the end!
      const doc = "<html><body>Redirectin'</body></html>";
      res.statusCode = 301;
      res.setHeader('Content-Type', 'text/html; charset=UTF-8');
      res.setHeader('Content-Length', Buffer.byteLength(doc));
      res.setHeader('Location', req.url + '/');
      res.end(doc);
      return;
    }
  } catch (e) {
    const err = e as Error;
    if (!maybeListing) {
      return return404(res, err);
    }
  }

  try {
    let data = await fs.readFile(localPath, {encoding: 'utf8'});
    let mimeType = mime.getType(localPath);
    const isMarkdown = req.url?.toLocaleLowerCase().endsWith('.md');
    if (isMarkdown && options.markdown) {
      data = marked(data, {gfm: true});
      mimeType = 'text/html; charset=UTF-8';
    }
    res.setHeader('Content-Type', mimeType!);
    res.setHeader('Content-Length', Buffer.byteLength(data));
    res.writeHead(200);
    res.end(data);
  } catch (e) {
    if (maybeListing) {
      try {
        const files = await fs.readdir(originalPath);
        const fileList = files
          .filter(f => escape(f))
          .map(f => `<li><a href="${f}">${f}</a></li>`)
          .join('\r\n');
        const data = `<html><body><ul>${fileList}</ul></body></html>`;
        res.writeHead(200);
        res.end(data);
        return;
      } catch (e) {
        const err = e as Error;
        return return404(res, err);
      }
    } else {
      const err = e as Error;
      return return404(res, err);
    }
  }
}

function return404(res: http.ServerResponse, err: Error) {
  res.writeHead(404);
  res.end(JSON.stringify(err));
}
