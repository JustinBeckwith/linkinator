import * as cheerio from 'cheerio';
import isAbsoluteUrl = require('is-absolute-url');
import {URL} from 'url';

export function getLinks(source: string, baseUrl: string) {
  const $ = cheerio.load(source);
  const links = $('a').toArray().map(e => e.attribs.href).filter(x => !!x);
  const sanitized = links.map(link => {
    const slink =
        isAbsoluteUrl(link) ? new URL(link) : (new URL(link, baseUrl));
    slink.hash = '';
    return slink.href;
  });
  return sanitized;
}
