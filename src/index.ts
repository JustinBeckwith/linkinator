import {EventEmitter} from 'events';
import * as gaxios from 'gaxios';
import * as http from 'http';
import enableDestroy = require('server-destroy');

import {getLinks} from './links';

const ecstatic = require('ecstatic');

export interface CheckOptions {
  port?: number;
  path: string;
  recurse?: boolean;
  linksToSkip?: string[];
}

export enum LinkState {
  OK = 'OK',
  BROKEN = 'BROKEN',
  SKIPPED = 'SKIPPED'
}

export interface LinkResult {
  url: string;
  status?: number;
  state: LinkState;
}

export interface CrawlResult {
  passed: boolean;
  links: LinkResult[];
}

interface CrawlOptions {
  url: string;
  crawl: boolean;
  results: LinkResult[];
  cache: Set<string>;
  checkOptions: CheckOptions;
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
    options.linksToSkip.push('^mailto:');
    let server: http.Server|undefined;
    if (!options.path.startsWith('http')) {
      const port = options.port || 5000 + Math.round(Math.random() * 1000);
      server = await this.startWebServer(options.path, port);
      enableDestroy(server);
      options.path = `http://localhost:${port}`;
    }
    const results = await this.crawl({
      url: options.path,
      crawl: true,
      checkOptions: options,
      results: [],
      cache: new Set()
    });
    const result = {
      links: results,
      passed: results.filter(x => x.state === LinkState.BROKEN).length === 0
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
   * @private
   * @returns Promise that resolves with the instance of the HTTP server
   */
  private startWebServer(root: string, port: number): Promise<http.Server> {
    return new Promise(resolve => {
      const server = http.createServer(ecstatic({root}))
                         .listen(port, () => resolve(server));
    });
  }

  /**
   * Crawl a given url with the provided options.
   * @pram opts List of options used to do the crawl
   * @private
   * @returns A list of crawl results consisting of urls and status codes
   */
  private async crawl(opts: CrawlOptions): Promise<LinkResult[]> {
    // Check to see if we've already scanned this url
    if (opts.cache.has(opts.url)) {
      return opts.results;
    }
    opts.cache.add(opts.url);

    // Check for links that should be skipped
    const skips = opts.checkOptions.linksToSkip!
                      .map(linkToSkip => {
                        return (new RegExp(linkToSkip)).test(opts.url);
                      })
                      .filter(match => !!match);
    if (skips.length > 0) {
      const result: LinkResult = {url: opts.url, state: LinkState.SKIPPED};
      opts.results.push(result);
      this.emit('link', result);
      return opts.results;
    }

    // Perform a HEAD or GET request based on the need to crawl
    let status = 0;
    let state = LinkState.BROKEN;
    let data = '';
    let shouldRecurse = false;
    try {
      let res = await gaxios.request<string>({
        method: opts.crawl ? 'GET' : 'HEAD',
        url: opts.url,
        responseType: opts.crawl ? 'text' : 'stream',
        validateStatus: () => true
      });

      // If we got an HTTP 405, the server may not like HEAD. GET instead!
      if (res.status === 405) {
        res = await gaxios.request<string>({
          method: 'GET',
          url: opts.url,
          responseType: 'stream',
          validateStatus: () => true
        });
      }

      // Assume any 2xx status is 👌
      status = res.status;
      if (res.status >= 200 && res.status < 300) {
        state = LinkState.OK;
      }
      data = res.data;
      shouldRecurse = isHtml(res);
    } catch (err) {
      // request failure: invalid domain name, etc.
    }
    const result: LinkResult = {url: opts.url, status, state};
    opts.results.push(result);
    this.emit('link', result);

    // If we need to go deeper, scan the next level of depth for links and crawl
    if (opts.crawl && shouldRecurse) {
      this.emit('pagestart', opts.url);
      const urls = getLinks(data, opts.url);
      for (const url of urls) {
        // only crawl links that start with the same host
        const crawl = opts.checkOptions.recurse! &&
            url.startsWith(opts.checkOptions.path);
        await this.crawl({
          url,
          crawl,
          cache: opts.cache,
          results: opts.results,
          checkOptions: opts.checkOptions
        });
      }
    }

    // Return the aggregate results
    return opts.results;
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
  return !!contentType.match('text/html');
}
