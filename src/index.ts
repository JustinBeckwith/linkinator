import { EventEmitter } from 'events';
import * as gaxios from 'gaxios';
import * as http from 'http';
import enableDestroy = require('server-destroy');

import { getLinks } from './links';

const finalhandler = require('finalhandler');
const serveStatic = require('serve-static');

declare type url = string;

export interface CheckOptions {
  port?: number;
  path: string;
  recurse?: boolean;
  linksToSkip?: string[];
}

export enum LinkState {
  OK = 'OK',
  BROKEN = 'BROKEN',
  SKIPPED = 'SKIPPED',
}

export interface LinkResult {
  url: url;
  status?: number;
  state: LinkState;
}

export interface CrawlResult {
  passed: boolean;
  links: LinkResult[];
}

interface CrawlOptions {
  url: url;
  crawl: boolean;
  results: LinkResult[];
  cache: Set<string>;
  checkOptions: CheckOptions;
}

const isHtml = (response: gaxios.GaxiosResponse) => {
  const contentType = response.headers['content-type'] || '';
  return !!contentType.match('text/html');
};

export class LinkChecker extends EventEmitter {
  async check(options: CheckOptions) {
    options.linksToSkip = options.linksToSkip || [];
    options.linksToSkip.push('^mailto:');
    let server: http.Server | undefined;
    if (!options.path.startsWith('http')) {
      const port = options.port || 5000 + Math.round(Math.random() * 1000);
      server = await this._startStaticWebServer(options.path, port);
      enableDestroy(server);
      options.path = `http://localhost:${port}`;
    }
    const results = await this._filterCachedFilterSkippedThenCrawlUrlAndChildren({
      url: options.path,
      crawl: true,
      checkOptions: options,
      results: [],
      cache: new Set(),
    });
    const result = {
      links: results,
      passed: results.filter(x => x.state === LinkState.BROKEN).length === 0,
    };
    if (server) {
      server.destroy();
    }
    return result;
  }

  private _startStaticWebServer(root: string, port: number): Promise<http.Server> {
    return new Promise((resolve, reject) => {
      const serve = serveStatic(root);
      const server = http
        .createServer((req, res) => serve(req, res, finalhandler(req, res)))
        .listen(port, () => resolve(server))
        .on('error', reject);
    });
  }

  private async _fetch(url: url, shouldCrawl: boolean) {
    // Perform a HEAD or GET request based on the need to crawl
    let status = 0;
    let state = LinkState.BROKEN;
    let data = '';
    let shouldRecurse = false;
    try {
      let res = await gaxios.request<string>({
        method: shouldCrawl ? 'GET' : 'HEAD',
        url: url,
        responseType: shouldCrawl ? 'text' : 'stream',
        validateStatus: () => true,
      });

      // If we got an HTTP 405, the server may not like HEAD. GET instead!
      if (res.status === 405) {
        res = await gaxios.request<string>({
          method: 'GET',
          url: url,
          responseType: 'stream',
          validateStatus: () => true,
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
    return {
      data,
      shouldRecurse,
      linkResult: <LinkResult>{ url: url, status, state },
    };
  }

  // todo: refactor to support parallel requests
  private async _filterCachedFilterSkippedThenCrawlUrlAndChildren(opts: CrawlOptions): Promise<LinkResult[]> {
    // Check to see if we've already scanned this url
    if (opts.cache.has(opts.url)) {
      return opts.results;
    }
    opts.cache.add(opts.url);

    // Check for links that should be skipped
    const skips = opts.checkOptions
      .linksToSkip!.map(linkToSkip => {
        return new RegExp(linkToSkip).test(opts.url);
      })
      .filter(match => !!match);
    if (skips.length > 0) {
      const result: LinkResult = { url: opts.url, state: LinkState.SKIPPED };
      opts.results.push(result);
      this.emit('link', result);
      return opts.results;
    }

    const fetchResult = await this._fetch(opts.url, opts.crawl);
    opts.results.push(fetchResult.linkResult);
    this.emit('link', fetchResult);

    // If we need to go deeper, scan the next level of depth for links and crawl
    if (opts.crawl && fetchResult.shouldRecurse) {
      this.emit('pagestart', opts.url);
      const urls = getLinks(fetchResult.data, opts.url);
      for (const url of urls) {
        // only crawl links that start with the same host
        const crawl = opts.checkOptions.recurse! && url.startsWith(opts.checkOptions.path);
        await this._filterCachedFilterSkippedThenCrawlUrlAndChildren({
          url,
          crawl,
          cache: opts.cache,
          results: opts.results,
          checkOptions: opts.checkOptions,
        });
      }
    }

    // Return the aggregate results
    return opts.results;
  }
}

export async function check(options: CheckOptions) {
  const checker = new LinkChecker();
  const results = await checker.check(options);
  return results;
}
