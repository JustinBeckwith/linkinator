'use strict';
const is = require('@sindresorhus/is');
const parse5 = require('parse5');

const treeAdapter = Object.create(parse5.treeAdapters.default);
treeAdapter.createElement_old = treeAdapter.createElement;
treeAdapter.createElement = function(tagName, namespaceURI, attrs) {
  const result = treeAdapter.createElement_old(tagName, namespaceURI, attrs);

  if (result.attrs) {
    result.attrMap = getAttrMap(result.attrs);
  }

  return result;
};

const options = { locationInfo: true, treeAdapter: treeAdapter };

/*
	Convert attributes array to a map.

	Note: parse5 will have already handled multiple attrs of the
	same name.
*/
function getAttrMap(attrs) {
  let i;
  const map = {};
  const numAttrs = attrs.length;

  for (i = 0; i < numAttrs; i++) {
    map[attrs[i].name] = attrs[i].value;
  }

  return map;
}

/*
	Parse an HTML stream/string and return a tree.
*/
function parseHtml(input) {
  return new Promise((resolve, reject) => {
    if (is.nodeStream(input)) {
      const parser = new parse5.ParserStream(options);

      parser.on('finish', () => {
        resolve(parser.document);
      });

      input.pipe(parser);
    } else if (is.string(input) === true) {
      resolve(parse5.parse(input, options));
    } else {
      reject('Invalid input');
    }
  });
}

module.exports = parseHtml;
