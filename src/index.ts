import {EventEmitter} from 'events';
import * as gaxios from 'gaxios';
import * as http from 'http';
import enableDestroy = require('server-destroy');
import * as express from 'express';
import * as fs from 'fs';
import * as util from 'util';
import * as path from 'path';
import * as marked from 'marked';
import PQueue, {DefaultAddOptions} from 'p-queue';

import {getLinks} from './links';
import {URL} from 'url';
import PriorityQueue from 'p-queue/dist/priority-queue';

const stat = util.promisify(fs.stat);

export interface CheckOptions {
  concurrency?: number;
  port?: number;
  path: string;
  recurse?: boolean;
  timeout?: number;
  markdown?: boolean;
  linksToSkip?: string[] | ((link: string) => Promise<boolean>);
}

export enum LinkState {
  OK = 'OK',
  BROKEN = 'BROKEN',
  SKIPPED = 'SKIPPED',
}

export interface LinkResult {
  url: string;
  status?: number;
  state: LinkState;
  parent?: string;
}

export interface CrawlResult {
  passed: boolean;
  links: LinkResult[];
}

interface CrawlOptions {
  url: URL;
  parent?: string;
  crawl: boolean;
  results: LinkResult[];
  cache: Set<string>;
  checkOptions: CheckOptions;
  queue: PQueue<PriorityQueue, DefaultAddOptions>;
}

/**
 * Instance class used to perform a crawl job.
 */
export class LinkChecker extends EventEmitter {
  /**
   * Crawl a given url or path, and return a list of visited links along with
   * status codes.
   * @param options Options to use while checking for 404s
   */
  async check(options: CheckOptions) {
    options.linksToSkip = options.linksToSkip || [];
    let server: http.Server | undefined;
    if (!options.path.startsWith('http')) {
      let localDirectory = options.path;
      let localFile = '';
      const s = await stat(options.path);
      if (s.isFile()) {
        const pathParts = options.path.split(path.sep);
        localFile = path.sep + pathParts[pathParts.length - 1];
        localDirectory = pathParts
          .slice(0, pathParts.length - 1)
          .join(path.sep);
      }
      const port = options.port || 5000 + Math.round(Math.random() * 1000);
      server = await this.startWebServer(
        localDirectory,
        port,
        options.markdown
      );
      enableDestroy(server);
      options.path = `http://localhost:${port}${localFile}`;
    }

    const queue = new PQueue({
      concurrency: options.concurrency || 100,
    });

    const results = new Array<LinkResult>();
    const url = new URL(options.path);
    const initCache: Set<string> = new Set();
    initCache.add(url.href);
    queue.add(async () => {
      await this.crawl({
        url: new URL(options.path),
        crawl: true,
        checkOptions: options,
        results,
        cache: initCache,
        queue,
      });
    });
    await queue.onIdle();

    const result = {
      links: results,
      passed: results.filter(x => x.state === LinkState.BROKEN).length === 0,
    };
    if (server) {
      server.destroy();
    }
    return result;
  }

  /**
   * Spin up a local HTTP server to serve static requests from disk
   * @param root The local path that should be mounted as a static web server
   * @param port The port on which to start the local web server
   * @param markdown If markdown should be automatically compiled and served
   * @private
   * @returns Promise that resolves with the instance of the HTTP server
   */
  private async startWebServer(root: string, port: number, markdown?: boolean) {
    const app = express()
      .use((req, res, next) => {
        if (!markdown) {
          return next();
        }
        const pathParts = req.path
          .toLowerCase()
          .split('/')
          .filter(x => !!x);
        if (pathParts.length === 0) {
          return next();
        }
        const ext = path.extname(pathParts[pathParts.length - 1]);
        if (ext === '.md') {
          fs.readFile(root + req.path, {encoding: 'utf-8'}, (err, data) => {
            if (err) {
              return next(err);
            }
            marked(data, {gfm: true}, (err, result) => {
              if (err) {
                return next(err);
              }
              res.send(result).end();
              return;
            });
          });
        } else {
          return next();
        }
      })
      .use(express.static(root));
    const server = await new Promise<http.Server>(resolve => {
      const s = app.listen(port, () => resolve(s));
    });
    return server;
  }

  /**
   * Crawl a given url with the provided options.
   * @pram opts List of options used to do the crawl
   * @private
   * @returns A list of crawl results consisting of urls and status codes
   */
  async crawl(opts: CrawlOptions): Promise<void> {
    // explicitly skip non-http[s] links before making the request
    const proto = opts.url.protocol;
    if (proto !== 'http:' && proto !== 'https:') {
      const r = {
        url: opts.url.href,
        status: 0,
        state: LinkState.SKIPPED,
        parent: opts.parent,
      };
      opts.results.push(r);
      this.emit('link', r);
      return;
    }

    // Check for a user-configured function to filter out links
    if (
      typeof opts.checkOptions.linksToSkip === 'function' &&
      (await opts.checkOptions.linksToSkip(opts.url.href))
    ) {
      const result: LinkResult = {
        url: opts.url.href,
        state: LinkState.SKIPPED,
        parent: opts.parent,
      };
      opts.results.push(result);
      this.emit('link', result);
      return;
    }

    // Check for a user-configured array of link regular expressions that should be skipped
    if (Array.isArray(opts.checkOptions.linksToSkip)) {
      const skips = opts.checkOptions.linksToSkip
        .map(linkToSkip => {
          return new RegExp(linkToSkip).test(opts.url.href);
        })
        .filter(match => !!match);

      if (skips.length > 0) {
        const result: LinkResult = {
          url: opts.url.href,
          state: LinkState.SKIPPED,
          parent: opts.parent,
        };
        opts.results.push(result);
        this.emit('link', result);
        return;
      }
    }

    // Perform a HEAD or GET request based on the need to crawl
    let status = 0;
    let state = LinkState.BROKEN;
    let data = '';
    let shouldRecurse = false;
    let res: gaxios.GaxiosResponse<string> | undefined = undefined;
    try {
      res = await gaxios.request<string>({
        method: opts.crawl ? 'GET' : 'HEAD',
        url: opts.url.href,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.117 Safari/537.36',
        },
        responseType: opts.crawl ? 'text' : 'stream',
        validateStatus: () => true,
        timeout: opts.checkOptions.timeout,
      });

      // If we got an HTTP 405, the server may not like HEAD. GET instead!
      if (res.status === 405) {
        res = await gaxios.request<string>({
          method: 'GET',
          url: opts.url.href,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.117 Safari/537.36',
          },
          responseType: 'stream',
          validateStatus: () => true,
          timeout: opts.checkOptions.timeout,
        });
      }
    } catch (err) {
      // request failure: invalid domain name, etc.
      // this also occasionally catches too many redirects, but is still valid (e.g. https://www.ebay.com)
      // for this reason, we also try doing a GET below to see if the link is valid
    }

    try {
      //some sites don't respond to a stream response type correctly, especially with a HEAD. Try a GET with a text response type
      if (
        (res === undefined || res.status < 200 || res.status >= 300) &&
        !opts.crawl
      ) {
        res = await gaxios.request<string>({
          method: 'GET',
          url: opts.url.href,
          responseType: 'text',
          validateStatus: () => true,
          timeout: opts.checkOptions.timeout,
        });
      }
    } catch (ex) {
      // catch the next failure
    }

    if (res !== undefined) {
      status = res.status;
      data = res.data;
      shouldRecurse = isHtml(res);
    }

    // Assume any 2xx status is 👌
    if (status >= 200 && status < 300) {
      state = LinkState.OK;
    }

    const result: LinkResult = {
      url: opts.url.href,
      status,
      state,
      parent: opts.parent,
    };
    opts.results.push(result);
    this.emit('link', result);

    // If we need to go deeper, scan the next level of depth for links and crawl
    if (opts.crawl && shouldRecurse) {
      this.emit('pagestart', opts.url);
      const urlResults = getLinks(data, opts.url.href);
      for (const result of urlResults) {
        // if there was some sort of problem parsing the link while
        // creating a new URL obj, treat it as a broken link.
        if (!result.url) {
          const r = {
            url: result.link,
            status: 0,
            state: LinkState.BROKEN,
            parent: opts.url.href,
          };
          opts.results.push(r);
          this.emit('link', r);
          continue;
        }

        let crawl = (opts.checkOptions.recurse! &&
          result.url &&
          result.url.href.startsWith(opts.checkOptions.path)) as boolean;

        // only crawl links that start with the same host
        if (crawl) {
          try {
            const pathUrl = new URL(opts.checkOptions.path);
            crawl = result.url!.host === pathUrl.host;
          } catch {
            // ignore errors
          }
        }

        // Ensure the url hasn't already been touched, largely to avoid a
        // very large queue length and runaway memory consumption
        if (!opts.cache.has(result.url.href)) {
          opts.cache.add(result.url.href);
          opts.queue.add(async () => {
            await this.crawl({
              url: result.url!,
              crawl,
              cache: opts.cache,
              results: opts.results,
              checkOptions: opts.checkOptions,
              queue: opts.queue,
              parent: opts.url.href,
            });
          });
        }
      }
    }
  }
}

/**
 * Convenience method to perform a scan.
 * @param options CheckOptions to be passed on
 */
export async function check(options: CheckOptions) {
  const checker = new LinkChecker();
  const results = await checker.check(options);
  return results;
}

/**
 * Checks to see if a given source is HTML.
 * @param {object} response Page response.
 * @returns {boolean}
 */
function isHtml(response: gaxios.GaxiosResponse): boolean {
  const contentType = response.headers['content-type'] || '';
  return (
    !!contentType.match(/text\/html/g) ||
    !!contentType.match(/application\/xhtml\+xml/g)
  );
}
