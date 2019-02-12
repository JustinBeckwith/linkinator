'use strict';
const isString = require('is-string');
const urllib = require('url');
const urlobj = require('urlobj');

const hasOwnProperty = Object.prototype.hasOwnProperty;

function linkObj(url) {
  if (url === undefined || isString(url) === false) {
    url = null;
  }

  const link = {
    url: {
      original: url, // The URL as it was inputted
      resolved: null, // The URL, resolved as a browser would do so
      redirected: null // The URL, after its last redirection, if any
    },

    base: {
      original: null, // The base URL as it was inputted
      resolved: null // The base URL, resolved as a browser would do so
    },

    html: {
      index: null, // The order in which the link appeared in its document -- using max-level tag filter
      offsetIndex: null, // Sequential (gap-free) indicies for skipped and unskipped links
      location: null, // Source code location of the attribute that the link was found within
      selector: null, // CSS selector for element in document
      tagName: null, // Tag name that the link was found on
      attrName: null, // Attribute name that the link was found within
      attrs: null, // All attributes on the element
      text: null, // TextNode/innerText within the element
      tag: null, // The entire tag string

      // Temporary keys
      base: null
    },

    http: {
      cached: null, // If the response was pulled from cache
      response: null // The request response
    },

    broken: null, // If the link was determined to be broken or not
    internal: null, // If the link is to the same server as its base/document
    samePage: null, // If the link is to the same page as its base/document
    excluded: null, // If the link was excluded due to any filtering

    brokenReason: null, // The reason why the link was considered broken, if it indeed is
    excludedReason: null, // The reason why the link was excluded from being checked, if it indeed was

    // Temporary keys
    broken_link_checker: true,
    resolved: false
  };

  // Not enumerable -- hidden from `JSON.stringify()`
  Object.defineProperty(link.base, 'parsed', { value: null, writable: true }); // Same as `link.base.resolved`, but is an Object
  Object.defineProperty(link.url, 'parsed', { value: null, writable: true }); // Same as `link.url.resolved`, but is an Object

  return link;
}

/*
	Remove unnecessary keys for public use.
*/
linkObj.clean = function(link) {
  delete link.broken_link_checker;
  delete link.html.base;
  delete link.resolved;

  return link;
};

/*
	Define relationships with base URL.
*/
linkObj.relation = function(link, url_parsed) {
  if (url_parsed === undefined) url_parsed = link.url.parsed;
  else if (typeof url_parsed === 'string')
    url_parsed = urlobj.parse(url_parsed);

  let relation;

  // If no protocols, it's impossible to determine if they link to the same server
  if (url_parsed.protocol === null || link.base.parsed.protocol === null) {
    // Overwrite any previous values
    link.internal = null;
    link.samePage = null;
  } else {
    // Resolved base not used because html base could be remote
    relation = urlobj.relation(url_parsed, link.base.parsed);

    link.internal = relation >= urlobj.component.AUTH;
    link.samePage = link.internal === true && relation >= urlobj.component.PATH;
  }

  return link;
};

/*
	Absolute'ize a link based on its base URL and HTML's <base>.
*/
linkObj.resolve = function(link, base, options) {
  // If already resolved
  if (link.resolved === true) return;

  // Parity with core `url.resolve()`
  const parseOptions = { slashesDenoteHost: true };

  let base_parsed = base || '';
  base_parsed = urlobj.normalize(urlobj.parse(base_parsed, parseOptions));

  let htmlBase_parsed = link.html.base || '';
  htmlBase_parsed = urlobj.normalize(
    urlobj.parse(htmlBase_parsed, parseOptions)
  );

  const resolvedBase_parsed = urlobj.resolve(base_parsed, htmlBase_parsed);

  if (resolvedBase_parsed.hash !== null) {
    // Hashes are useless in a base
    resolvedBase_parsed.hash = null;
    resolvedBase_parsed.href = urllib.format(resolvedBase_parsed);
  }

  if (base_parsed.hash !== null) {
    // Hashes are useless in a base
    base_parsed.hash = null;
    base_parsed.href = urllib.format(base_parsed);
  }

  // `link.url.original` should only ever not have a value within internal tests
  let linkOrg_parsed = link.url.original || '';
  linkOrg_parsed = urlobj.parse(linkOrg_parsed, parseOptions);
  urlobj.normalize(linkOrg_parsed);

  // `linkOrg_parsed` is cloned to avoid it being mutated
  const resolvedUrl_parsed = urlobj.resolve(
    resolvedBase_parsed,
    cloneObject(linkOrg_parsed)
  );

  if (base !== undefined) {
    link.base.original = base;
  }

  if (resolvedBase_parsed.href !== '') {
    link.base.resolved = parity(resolvedBase_parsed.href);
  }

  link.base.parsed = base_parsed;

  // If resolved link has accepted scheme
  if (
    options.acceptedSchemes[resolvedUrl_parsed.extra.protocolTruncated] === true
  ) {
    link.url.resolved = parity(resolvedUrl_parsed.href);
    link.url.parsed = resolvedUrl_parsed;
    linkObj.relation(link);
  }
  // Else could not be properly resolved
  else {
    link.url.parsed = linkOrg_parsed;

    // If at least resolved to absolute
    if (resolvedUrl_parsed.extra.type === urlobj.type.ABSOLUTE) {
      // If base is accepted scheme
      if (
        options.acceptedSchemes[base_parsed.extra.protocolTruncated] === true
      ) {
        link.internal = false;
        link.samePage = false;
      }
    }
  }

  // Avoid future resolving
  link.resolved = true;

  return link;
};

//::: PRIVATE FUNCTIONS

/*
	Clones an object and its prototype while maintaining enumerable
	keys and support for `instanceof`.
*/
function cloneObject(source) {
  let clone, key, value;

  if (Array.isArray(source) === true) {
    clone = [];
  } else {
    // Only clone the prototype -- more efficient as it will not convert keys to prototype keys
    clone = Object.create(Object.getPrototypeOf(source));
  }

  // Clone keys/indexes
  for (key in source) {
    if (hasOwnProperty.call(source, key) === true) {
      value = source[key];

      if (value !== null && typeof value === 'object') {
        clone[key] = cloneObject(value);
      } else {
        clone[key] = value;
      }
    }
  }

  return clone;
}

/*
	Maintain parity with core `url.resolve()`.
*/
function parity(url) {
  return url !== 'http://' ? url : 'http:///';
}

module.exports = linkObj;
