"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.check = exports.LinkChecker = exports.headers = exports.LinkState = void 0;
const events_1 = require("events");
const url_1 = require("url");
const path = require("path");
const gaxios_1 = require("gaxios");
const queue_1 = require("./queue");
const links_1 = require("./links");
const server_1 = require("./server");
const options_1 = require("./options");
var LinkState;
(function (LinkState) {
    LinkState["OK"] = "OK";
    LinkState["BROKEN"] = "BROKEN";
    LinkState["SKIPPED"] = "SKIPPED";
})(LinkState = exports.LinkState || (exports.LinkState = {}));
// Spoof a normal looking User-Agent to keep the servers happy
exports.headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.117 Safari/537.36',
};
/**
 * Instance class used to perform a crawl job.
 */
class LinkChecker extends events_1.EventEmitter {
    /**
     * Crawl a given url or path, and return a list of visited links along with
     * status codes.
     * @param options Options to use while checking for 404s
     */
    async check(opts) {
        const options = await options_1.processOptions(opts);
        if (!Array.isArray(options.path)) {
            options.path = [options.path];
        }
        options.linksToSkip = options.linksToSkip || [];
        let server;
        const hasHttpPaths = options.path.find(x => x.startsWith('http'));
        if (!hasHttpPaths) {
            let port = options.port;
            server = await server_1.startWebServer({
                root: options.serverRoot,
                port,
                markdown: options.markdown,
                directoryListing: options.directoryListing,
            });
            if (port === undefined) {
                const addr = server.address();
                port = addr.port;
            }
            for (let i = 0; i < options.path.length; i++) {
                if (options.path[i].startsWith('/')) {
                    options.path[i] = options.path[i].slice(1);
                }
                options.path[i] = `http://localhost:${port}/${options.path[i]}`;
            }
            options.staticHttpServerHost = `http://localhost:${port}/`;
        }
        if (process.env.LINKINATOR_DEBUG) {
            console.log(options);
        }
        const queue = new queue_1.Queue({
            concurrency: options.concurrency || 100,
        });
        const results = new Array();
        const initCache = new Set();
        const delayCache = new Map();
        for (const path of options.path) {
            const url = new url_1.URL(path);
            initCache.add(url.href);
            queue.add(async () => {
                await this.crawl({
                    url,
                    crawl: true,
                    checkOptions: options,
                    results,
                    cache: initCache,
                    delayCache,
                    queue,
                    rootPath: path,
                    retry: !!opts.retry,
                });
            });
        }
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
     * Crawl a given url with the provided options.
     * @pram opts List of options used to do the crawl
     * @private
     * @returns A list of crawl results consisting of urls and status codes
     */
    async crawl(opts) {
        var _a;
        // apply any regex url replacements
        if (opts.checkOptions.urlRewriteExpressions) {
            for (const exp of opts.checkOptions.urlRewriteExpressions) {
                const newUrl = opts.url.href.replace(exp.pattern, exp.replacement);
                if (opts.url.href !== newUrl) {
                    opts.url.href = newUrl;
                }
            }
        }
        // explicitly skip non-http[s] links before making the request
        const proto = opts.url.protocol;
        if (proto !== 'http:' && proto !== 'https:') {
            const r = {
                url: mapUrl(opts.url.href, opts.checkOptions),
                status: 0,
                state: LinkState.SKIPPED,
                parent: mapUrl(opts.parent, opts.checkOptions),
            };
            opts.results.push(r);
            this.emit('link', r);
            return;
        }
        // Check for a user-configured function to filter out links
        if (typeof opts.checkOptions.linksToSkip === 'function' &&
            (await opts.checkOptions.linksToSkip(opts.url.href))) {
            const result = {
                url: mapUrl(opts.url.href, opts.checkOptions),
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
                const result = {
                    url: mapUrl(opts.url.href, opts.checkOptions),
                    state: LinkState.SKIPPED,
                    parent: mapUrl(opts.parent, opts.checkOptions),
                };
                opts.results.push(result);
                this.emit('link', result);
                return;
            }
        }
        // Check if this host has been marked for delay due to 429
        if (opts.delayCache.has(opts.url.host)) {
            const timeout = opts.delayCache.get(opts.url.host);
            if (timeout > Date.now()) {
                opts.queue.add(async () => {
                    await this.crawl(opts);
                }, {
                    delay: timeout - Date.now(),
                });
                return;
            }
        }
        // Perform a HEAD or GET request based on the need to crawl
        let status = 0;
        let state = LinkState.BROKEN;
        let data = '';
        let shouldRecurse = false;
        let res = undefined;
        const failures = [];
        try {
            res = await gaxios_1.request({
                method: opts.crawl ? 'GET' : 'HEAD',
                url: opts.url.href,
                headers: exports.headers,
                responseType: opts.crawl ? 'text' : 'stream',
                validateStatus: () => true,
                timeout: opts.checkOptions.timeout,
            });
            if (this.shouldRetryAfter(res, opts)) {
                return;
            }
            // If we got an HTTP 405, the server may not like HEAD. GET instead!
            if (res.status === 405) {
                res = await gaxios_1.request({
                    method: 'GET',
                    url: opts.url.href,
                    headers: exports.headers,
                    responseType: 'stream',
                    validateStatus: () => true,
                    timeout: opts.checkOptions.timeout,
                });
                if (this.shouldRetryAfter(res, opts)) {
                    return;
                }
            }
        }
        catch (err) {
            // request failure: invalid domain name, etc.
            // this also occasionally catches too many redirects, but is still valid (e.g. https://www.ebay.com)
            // for this reason, we also try doing a GET below to see if the link is valid
            failures.push(err);
        }
        try {
            //some sites don't respond to a stream response type correctly, especially with a HEAD. Try a GET with a text response type
            if ((res === undefined || res.status < 200 || res.status >= 300) &&
                !opts.crawl) {
                res = await gaxios_1.request({
                    method: 'GET',
                    url: opts.url.href,
                    responseType: 'text',
                    validateStatus: () => true,
                    headers: exports.headers,
                    timeout: opts.checkOptions.timeout,
                });
                if (this.shouldRetryAfter(res, opts)) {
                    return;
                }
            }
        }
        catch (ex) {
            failures.push(ex);
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
        else {
            failures.push(res);
        }
        const result = {
            url: mapUrl(opts.url.href, opts.checkOptions),
            status,
            state,
            parent: mapUrl(opts.parent, opts.checkOptions),
            failureDetails: failures,
        };
        opts.results.push(result);
        this.emit('link', result);
        // If we need to go deeper, scan the next level of depth for links and crawl
        if (opts.crawl && shouldRecurse) {
            this.emit('pagestart', opts.url);
            const urlResults = links_1.getLinks(data, opts.url.href);
            for (const result of urlResults) {
                // if there was some sort of problem parsing the link while
                // creating a new URL obj, treat it as a broken link.
                if (!result.url) {
                    const r = {
                        url: mapUrl(result.link, opts.checkOptions),
                        status: 0,
                        state: LinkState.BROKEN,
                        parent: mapUrl(opts.url.href, opts.checkOptions),
                    };
                    opts.results.push(r);
                    this.emit('link', r);
                    continue;
                }
                let crawl = (opts.checkOptions.recurse && ((_a = result.url) === null || _a === void 0 ? void 0 : _a.href.startsWith(opts.rootPath)));
                // only crawl links that start with the same host
                if (crawl) {
                    try {
                        const pathUrl = new url_1.URL(opts.rootPath);
                        crawl = result.url.host === pathUrl.host;
                    }
                    catch (_b) {
                        // ignore errors
                    }
                }
                // Ensure the url hasn't already been touched, largely to avoid a
                // very large queue length and runaway memory consumption
                if (!opts.cache.has(result.url.href)) {
                    opts.cache.add(result.url.href);
                    opts.queue.add(async () => {
                        await this.crawl({
                            url: result.url,
                            crawl,
                            cache: opts.cache,
                            delayCache: opts.delayCache,
                            results: opts.results,
                            checkOptions: opts.checkOptions,
                            queue: opts.queue,
                            parent: opts.url.href,
                            rootPath: opts.rootPath,
                            retry: opts.retry,
                        });
                    });
                }
            }
        }
    }
    /**
     * Check the incoming response for a `retry-after` header.  If present,
     * and if the status was an HTTP 429, calculate the date at which this
     * request should be retried. Ensure the delayCache knows that we're
     * going to wait on requests for this entire host.
     * @param res GaxiosResponse returned from the request
     * @param opts CrawlOptions used during this request
     */
    shouldRetryAfter(res, opts) {
        if (!opts.retry) {
            return false;
        }
        const retryAfterRaw = res.headers['retry-after'];
        if (res.status !== 429 || !retryAfterRaw) {
            return false;
        }
        // The `retry-after` header can come in either <seconds> or
        // A specific date to go check.
        let retryAfter = Number(retryAfterRaw) * 1000 + Date.now();
        if (isNaN(retryAfter)) {
            retryAfter = Date.parse(retryAfterRaw);
            if (isNaN(retryAfter)) {
                return false;
            }
        }
        // check to see if there is already a request to wait for this host
        if (opts.delayCache.has(opts.url.host)) {
            // use whichever time is higher in the cache
            const currentTimeout = opts.delayCache.get(opts.url.host);
            if (retryAfter > currentTimeout) {
                opts.delayCache.set(opts.url.host, retryAfter);
            }
        }
        else {
            opts.delayCache.set(opts.url.host, retryAfter);
        }
        opts.queue.add(async () => {
            await this.crawl(opts);
        }, {
            delay: retryAfter - Date.now(),
        });
        const retryDetails = {
            url: opts.url.href,
            status: res.status,
            secondsUntilRetry: Math.round((retryAfter - Date.now()) / 1000),
        };
        this.emit('retry', retryDetails);
        return true;
    }
}
exports.LinkChecker = LinkChecker;
/**
 * Convenience method to perform a scan.
 * @param options CheckOptions to be passed on
 */
async function check(options) {
    const checker = new LinkChecker();
    const results = await checker.check(options);
    return results;
}
exports.check = check;
/**
 * Checks to see if a given source is HTML.
 * @param {object} response Page response.
 * @returns {boolean}
 */
function isHtml(response) {
    const contentType = response.headers['content-type'] || '';
    return (!!contentType.match(/text\/html/g) ||
        !!contentType.match(/application\/xhtml\+xml/g));
}
/**
 * When running a local static web server for the user, translate paths from
 * the Url generated back to something closer to a local filesystem path.
 * @example
 *    http://localhost:0000/test/route/README.md => test/route/README.md
 * @param url The url that was checked
 * @param options Original CheckOptions passed into the client
 */
function mapUrl(url, options) {
    var _a, _b;
    if (!url) {
        return url;
    }
    let newUrl = url;
    // trim the starting http://localhost:0000 if we stood up a local static server
    if (((_a = options === null || options === void 0 ? void 0 : options.staticHttpServerHost) === null || _a === void 0 ? void 0 : _a.length) && (url === null || url === void 0 ? void 0 : url.startsWith(options.staticHttpServerHost))) {
        newUrl = url.slice(options.staticHttpServerHost.length);
        // add the full filesystem path back if we trimmed it
        if ((_b = options === null || options === void 0 ? void 0 : options.syntheticServerRoot) === null || _b === void 0 ? void 0 : _b.length) {
            newUrl = path.join(options.syntheticServerRoot, newUrl);
        }
        if (newUrl === '') {
            newUrl = `.${path.sep}`;
        }
    }
    return newUrl;
}
//# sourceMappingURL=index.js.map