import * as cheerio from 'cheerio';
import { URL } from 'url';

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
} as { [index: string]: string[] };

export function getLinks(source: string, baseUrl: string) {
  const $ = cheerio.load(source);
  const links = new Array<string>();
  Object.keys(linksAttr).forEach(attr => {
    const elements = linksAttr[attr].map(tag => `${tag}[${attr}]`).join(',');
    $(elements).each((i, element) => {
      const values = parseAttr(attr, element.attribs[attr]);
      links.push(...values);
    });
  });
  const sanitized = links
    .filter(link => !!link)
    .map(link => normalizeLink(link, baseUrl));
  return sanitized;
}

function parseAttr(name: string, value: string): string[] {
  switch (name) {
    case 'srcset':
      return value
        .split(',')
        .map((pair: string) => pair.trim().split(/\s+/)[0]);
    default:
      return [value];
  }
}

function normalizeLink(link: string, baseUrl: string): string {
  try {
    const slink = new URL(link, baseUrl);
    slink.hash = '';
    return slink.href;
  } catch (e) {
    return link;
  }
}
