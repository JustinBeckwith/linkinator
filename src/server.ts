import * as http from 'http';
import * as path from 'path';
import * as util from 'util';
import * as fs from 'fs';
import * as marked from 'marked';
import serve = require('serve-handler');
import enableDestroy = require('server-destroy');

const readFile = util.promisify(fs.readFile);

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
  return new Promise<http.Server>((resolve, reject) => {
    const server = http
      .createServer(async (req, res) => {
        const pathParts = req.url!.split('/').filter(x => !!x);
        if (pathParts.length > 0) {
          const ext = path.extname(pathParts[pathParts.length - 1]);
          if (options.markdown && ext.toLowerCase() === '.md') {
            const filePath = path.join(path.resolve(options.root), req.url!);
            const data = await readFile(filePath, {encoding: 'utf-8'});
            const result = marked(data, {gfm: true});
            res.writeHead(200, {
              'content-type': 'text/html',
            });
            res.end(result);
            return;
          }
        }
        return serve(req, res, {
          public: options.root,
          directoryListing: options.directoryListing,
        });
      })
      .listen(options.port, () => resolve(server))
      .on('error', reject);
    enableDestroy(server);
  });
}
