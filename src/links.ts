import * as cheerio from 'cheerio';
import isAbsoluteUrl = require('is-absolute-url');
import {URL} from 'url';

const linksAttr = {
  background: ['body'],
  cite: ['blockquote', 'del', 'ins', 'q'],
  data: ['object'],
  href: ['a', 'area', 'embed', 'link'],
  icon: ['command'],
  longdesc: ['frame', 'iframe'],
  manifest: ['html'],
  poster: ['video'],
  pluginspage: ['embed'],
  pluginurl: ['embed'],
  src: [
    'audio', 'embed', 'frame', 'iframe', 'img', 'input', 'script', 'source',
    'track', 'video'
  ],
} as {[index: string]: string[]};

export function getLinks(source: string, baseUrl: string) {
  const $ = cheerio.load(source);
  const links = new Array<string>();
  Object.keys(linksAttr).forEach(attr => {
    const elements = linksAttr[attr].map(tag => `${tag}[${attr}]`).join(',');
    $(elements).each((i, element) => {
      links.push(element.attribs[attr]);
    });
  });
  const sanitized = links.filter(link => !!link)
                        .map(link => normalizeLink(link, baseUrl).href);
  return sanitized;
}

function normalizeLink(link: string, baseUrl: string): URL {
  const slink = isAbsoluteUrl(link) ? new URL(link) : (new URL(link, baseUrl));
  slink.hash = '';
  return slink;
}
