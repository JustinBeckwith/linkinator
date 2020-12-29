import * as http from 'http';
import * as path from 'path';
import * as util from 'util';
import * as fs from 'fs';
import * as marked from 'marked';
import finalhandler = require('finalhandler');
import serveStatic = require('serve-static');
import enableDestroy = require('server-destroy');

const readFile = util.promisify(fs.readFile);

/**
 * Spin up a local HTTP server to serve static requests from disk
 * @param root The local path that should be mounted as a static web server
 * @param port The port on which to start the local web server
 * @param markdown If markdown should be automatically compiled and served
 * @private
 * @returns Promise that resolves with the instance of the HTTP server
 */
export async function startWebServer(
  root: string,
  port: number,
  markdown?: boolean
) {
  return new Promise<http.Server>((resolve, reject) => {
    const serve = serveStatic(root);
    const server = http
      .createServer(async (req, res) => {
        const pathParts = req.url!.split('/').filter(x => !!x);
        if (pathParts.length > 0) {
          const ext = path.extname(pathParts[pathParts.length - 1]);
          if (markdown && ext.toLowerCase() === '.md') {
            const filePath = path.join(path.resolve(root), req.url!);
            const data = await readFile(filePath, {encoding: 'utf-8'});
            const result = marked(data, {gfm: true});
            res.writeHead(200, {
              'content-type': 'text/html',
            });
            res.end(result);
            return;
          }
        }
        return serve(req, res, finalhandler(req, res) as () => void);
      })
      .listen(port, () => resolve(server))
      .on('error', reject);
    enableDestroy(server);
  });
}
