'use strict';

const guard = require('robots-txt-guard');
const parse = require('robots-txt-parse');
const gaxios = require('gaxios');

const urllib = require('url');
const urlobj = require('urlobj');

async function getRobotsTxt(url, options) {
  url = urlobj.parse(url);
  url.hash = null;
  url.path = url.pathname = '/robots.txt';
  url.query = null;
  url.search = null;

  const res = await gaxios.request({
    url: urllib.format(url),
    headers: { 'user-agent': options.userAgent },
    responseType: 'stream',
    validateStatus: () => true
  });
  let txt;
  txt = await parse(res.data);
  txt = await guard(txt);
  return txt;
}

module.exports = getRobotsTxt;
