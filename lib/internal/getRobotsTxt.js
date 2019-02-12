"use strict";
const guard = require("robots-txt-guard");
const parse = require("robots-txt-parse");

const bhttp = require("bhttp");
const urllib = require("url");
const urlobj = require("urlobj");

function getRobotsTxt(url, options) {
  url = urlobj.parse(url);
  url.hash = null;
  url.path = url.pathname = "/robots.txt";
  url.query = null;
  url.search = null;

  return bhttp
    .get(urllib.format(url), {
      discardResponse: true,
      headers: { "user-agent": options.userAgent },
      stream: true
    })
    .then(parse)
    .then(guard);
}

module.exports = getRobotsTxt;
