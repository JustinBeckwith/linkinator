"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLinks = void 0;
const cheerio = require("cheerio");
const url_1 = require("url");
const linksAttr = {
    background: ['body'],
    cite: ['blockquote', 'del', 'ins', 'q'],
    data: ['object'],
    href: ['a', 'area', 'embed', 'link'],
    icon: ['command'],
    longdesc: ['frame', 'iframe'],
    manifest: ['html'],
    content: ['meta'],
    poster: ['video'],
    pluginspage: ['embed'],
    pluginurl: ['embed'],
    src: [
        'audio',
        'embed',
        'frame',
        'iframe',
        'img',
        'input',
        'script',
        'source',
        'track',
        'video',
    ],
    srcset: ['img', 'source'],
};
function getLinks(source, baseUrl) {
    const $ = cheerio.load(source);
    let realBaseUrl = baseUrl;
    const base = $('base[href]');
    if (base.length) {
        // only first <base by specification
        const htmlBaseUrl = base.first().attr('href');
        realBaseUrl = getBaseUrl(htmlBaseUrl, baseUrl);
    }
    const links = new Array();
    const attrs = Object.keys(linksAttr);
    for (const attr of attrs) {
        const elements = linksAttr[attr].map(tag => `${tag}[${attr}]`).join(',');
        $(elements).each((i, ele) => {
            const element = ele;
            if (!element.attribs) {
                return;
            }
            const values = parseAttr(attr, element.attribs[attr]);
            // ignore href properties for link tags where rel is likely to fail
            const relValuesToIgnore = ['dns-prefetch', 'preconnect'];
            if (element.tagName === 'link' &&
                relValuesToIgnore.includes(element.attribs['rel'])) {
                return;
            }
            // Only for <meta content=""> tags, only validate the url if
            // the content actually looks like a url
            if (element.tagName === 'meta' && element.attribs['content']) {
                try {
                    new url_1.URL(element.attribs['content']);
                }
                catch (e) {
                    return;
                }
            }
            for (const v of values) {
                if (v) {
                    const link = parseLink(v, realBaseUrl);
                    links.push(link);
                }
            }
        });
    }
    return links;
}
exports.getLinks = getLinks;
function getBaseUrl(htmlBaseUrl, oldBaseUrl) {
    if (isAbsoluteUrl(htmlBaseUrl)) {
        return htmlBaseUrl;
    }
    const url = new url_1.URL(htmlBaseUrl, oldBaseUrl);
    url.hash = '';
    return url.href;
}
function isAbsoluteUrl(url) {
    // Don't match Windows paths
    if (/^[a-zA-Z]:\\/.test(url)) {
        return false;
    }
    // Scheme: https://tools.ietf.org/html/rfc3986#section-3.1
    // Absolute URL: https://tools.ietf.org/html/rfc3986#section-4.3
    return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url);
}
function parseAttr(name, value) {
    switch (name) {
        case 'srcset':
            return value
                .split(',')
                .map((pair) => pair.trim().split(/\s+/)[0]);
        default:
            return [value];
    }
}
function parseLink(link, baseUrl) {
    try {
        const url = new url_1.URL(link, baseUrl);
        url.hash = '';
        return { link, url };
    }
    catch (error) {
        return { link, error };
    }
}
//# sourceMappingURL=links.js.map