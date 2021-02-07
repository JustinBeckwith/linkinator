import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import {promisify} from 'util';
import * as marked from 'marked';
import * as mime from 'mime';
import escape = require('escape-html');
import enableDestroy = require('server-destroy');

const readFile = promisify(fs.readFile);
const stat = promisify(fs.stat);
const readdir = promisify(fs.readdir);

export interface WebServerOptions {
  // The local path that should be mounted as a static web server
  root: string;
  // The port on which to start the local web server
  port: number;
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
      .listen(options.port, () => resolve(server))
      .on('error', reject);
    enableDestroy(server);
  });
}

async function handleRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  root: string,
  options: WebServerOptions
) {
  const pathParts = req.url?.split('/') || [];
  const originalPath = path.join(root, ...pathParts);
  if (req.url?.endsWith('/')) {
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
    const stats = await stat(localPath);
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
  } catch (err) {
    if (!maybeListing) {
      return return404(res, err);
    }
  }

  try {
    let data = await readFile(localPath, {encoding: 'utf8'});
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
  } catch (err) {
    if (maybeListing) {
      try {
        const files = await readdir(originalPath);
        const fileList = files
          .filter(f => escape(f))
          .map(f => `<li><a href="${f}">${f}</a></li>`)
          .join('\r\n');
        const data = `<html><body><ul>${fileList}</ul></body></html>`;
        res.writeHead(200);
        res.end(data);
        return;
      } catch (err) {
        return return404(res, err);
      }
    } else {
      return return404(res, err);
    }
  }
}

function return404(res: http.ServerResponse, err: Error) {
  res.writeHead(404);
  res.end(JSON.stringify(err));
}
