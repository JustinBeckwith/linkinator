import * as htmlParser from 'htmlparser2';
import {URL} from 'url';

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
} as {[index: string]: string[]};
// Create lookup table for tag name to attribute that contains URL:
const tagAttr: {[index: string]: string[]} = {};
Object.keys(linksAttr).forEach(attr => {
  for (const tag of linksAttr[attr]) {
    if (!tagAttr[tag]) tagAttr[tag] = [];
    tagAttr[tag].push(attr);
  }
});

export interface ParsedUrl {
  link: string;
  error?: Error;
  url?: URL;
}

export function getLinks(source: string, baseUrl: string): ParsedUrl[] {
  let realBaseUrl = baseUrl;
  let baseSet = false;
  const links = new Array<ParsedUrl>();
  const parser = new htmlParser.Parser({
    onopentag(tag: string, attributes: {[s: string]: string}) {
      // Allow alternate base URL to be specified in tag:
      if (tag === 'base' && !baseSet) {
        realBaseUrl = getBaseUrl(attributes.href, baseUrl);
        baseSet = true;
      }

      // ignore href properties for link tags where rel is likely to fail
      const relValuesToIgnore = ['dns-prefetch', 'preconnect'];
      if (tag === 'link' && relValuesToIgnore.includes(attributes.rel)) {
        return;
      }

      // Only for <meta content=""> tags, only validate the url if
      // the content actually looks like a url
      if (tag === 'meta' && attributes.content) {
        try {
          new URL(attributes.content);
        } catch (e) {
          return;
        }
      }

      if (tagAttr[tag]) {
        for (const attr of tagAttr[tag]) {
          if (attributes[attr]) {
            links.push(parseLink(attributes[attr], realBaseUrl));
          }
        }
      }
    },
  });
  parser.write(source);
  parser.end();
  return links;
}

function getBaseUrl(htmlBaseUrl: string, oldBaseUrl: string): string {
  if (isAbsoluteUrl(htmlBaseUrl)) {
    return htmlBaseUrl;
  }
  const url = new URL(htmlBaseUrl, oldBaseUrl);
  url.hash = '';
  return url.href;
}

function isAbsoluteUrl(url: string): boolean {
  // Don't match Windows paths
  if (/^[a-zA-Z]:\\/.test(url)) {
    return false;
  }

  // Scheme: https://tools.ietf.org/html/rfc3986#section-3.1
  // Absolute URL: https://tools.ietf.org/html/rfc3986#section-4.3
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(url);
}

function parseLink(link: string, baseUrl: string): ParsedUrl {
  try {
    const url = new URL(link, baseUrl);
    url.hash = '';
    return {link, url};
  } catch (error) {
    return {link, error};
  }
}
