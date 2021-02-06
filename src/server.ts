import * as http from 'http';
import * as path from 'path';
import * as fs from 'fs';
import * as marked from 'marked';
import * as mime from 'mime';
import enableDestroy = require('server-destroy');

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
      .createServer(async (req, res) => {
        let localPath = path.join(root, req.url!);
        const originalPath = localPath;
        if (localPath.endsWith(path.sep)) {
          localPath = path.join(localPath, 'index.html');
        }
        const maybeListing =
          options.directoryListing && localPath.endsWith('index.html');
        fs.stat(localPath, (err, stats) => {
          if (err) {
            if (!maybeListing) {
              return return404(res, err);
            }
          } else {
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
          }
          fs.readFile(localPath, {encoding: 'utf8'}, (err, data) => {
            if (err) {
              if (maybeListing) {
                fs.readdir(originalPath, (err, files) => {
                  if (err) {
                    return return404(res, err);
                  }
                  const fileList = files
                    .map(f => `<li><a href="${f}">${f}</a></li>`)
                    .join('\r\n');
                  const data = `<html><body><ul>${fileList}</ul></body></html>`;
                  res.writeHead(200);
                  res.end(data);
                  return;
                });
              } else {
                return return404(res, err);
              }
            } else {
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
            }
          });
        });
      })
      .listen(options.port, () => resolve(server))
      .on('error', reject);
    enableDestroy(server);
  });
}

function return404(res: http.ServerResponse, err: unknown) {
  res.writeHead(404);
  res.end(JSON.stringify(err));
  return;
}
