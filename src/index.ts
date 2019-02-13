import {EventEmitter} from 'events';
import * as gaxios from 'gaxios';
import * as http from 'http';

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
  results?: LinkResult[];
  cache?: string[];
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
    let server: http.Server|undefined;
    let result: CrawlResult;
    try {
      options.linksToSkip = options.linksToSkip || [];
      if (!options.path.startsWith('http')) {
        const port = options.port || 5000 + Math.round(Math.random() * 1000);
        server = await this.startWebServer(options.path, port);
        options.path = `http://localhost:${port}`;
      }
      const results = await this.crawl(
          {url: options.path, crawl: true, checkOptions: options});
      result = {
        links: results,
        passed: results.filter(x => x.state === LinkState.BROKEN).length === 0
      };
    } catch (e) {
      throw e;
    } finally {
      if (server) {
        server.close();
      }
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
    return new Promise((resolve, reject) => {
      const server =
          http.createServer(ecstatic({root})).listen(port, (err: Error) => {
            if (err) {
              reject(err);
            } else {
              resolve(server);
            }
          });
    });
  }

  /**
   * Crawl a given url with the provided options.
   * @pram opts List of options used to do the crawl
   * @private
   * @returns A list of crawl results consisting of urls and status codes
   */
  private async crawl(opts: CrawlOptions): Promise<LinkResult[]> {
    opts.results = opts.results || [];
    opts.cache = opts.cache || [];

    // Check to see if we've already scanned this url
    if (opts.cache.includes(opts.url)) {
      return opts.results;
    }
    opts.cache.push(opts.url);

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
    const res = await gaxios.request<string>({
      method: 'GET',
      url: opts.url,
      responseType: opts.crawl ? 'text' : 'stream',
      validateStatus: () => true
    });
    const result: LinkResult = {
      url: opts.url,
      status: res.status,
      state: (res.status >= 200 && res.status < 300) ? LinkState.OK :
                                                       LinkState.BROKEN
    };
    opts.results.push(result);
    this.emit('link', result);

    // If we need to go deeper, scan the next level of depth for links and crawl
    if (opts.crawl) {
      this.emit('pagestart', opts.url);
      const urls = getLinks(res.data, opts.checkOptions.path);
      for (const url of urls) {
        // only crawl links that start with the same host
        const crawl = url.startsWith(opts.checkOptions.path);
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
