'use strict';

const linkObj = require('./linkObj');
const tags = require('./tags');
const condenseWhitespace = require('condense-whitespace');
const parseMetaRefresh = require('http-equiv-refresh');
const RobotDirectives = require('robot-directives');

const maxFilterLevel = tags[tags.length - 1];

/*
	Scrape a parsed HTML document/tree for links.
*/
function scrapeHtml(document, robots) {
  let link, links, preliminaries;

  const rootNode = findRootNode(document);

  if (rootNode) {
    preliminaries = findPreliminaries(rootNode, robots);
    links = [];

    findLinks(rootNode, (node, attrName, url) => {
      link = linkObj(url);

      link.html.attrs = node.attrMap;
      link.html.attrName = attrName;
      link.html.base = preliminaries.base;
      link.html.index = links.length;
      link.html.selector = getSelector(node);
      link.html.tag = stringifyNode(node);
      link.html.tagName = node.nodeName;
      link.html.text = getText(node);

      // If not a "fake" (duplicated) element, as a result of adoption
      if (node.__location !== undefined) {
        link.html.location = node.__location.attrs[attrName];
      }

      links.push(link);
    });
  }

  return links;
}

//::: PRIVATE FUNCTIONS

/*
	Traverses the root node to locate links that match filters.
*/
function findLinks(rootNode, callback) {
  let attrName, i, linkAttrs, numAttrs, url;

  walk(rootNode, node => {
    linkAttrs = maxFilterLevel[node.nodeName];

    // If a supported element
    if (linkAttrs) {
      numAttrs = node.attrs.length;

      // Faster to loop through Arrays than Objects
      for (i = 0; i < numAttrs; i++) {
        attrName = node.attrs[i].name;
        url = null;

        // If a supported attribute
        if (linkAttrs[attrName] === true) {
          // Special case for `<meta http-equiv="refresh" content="5; url=redirect.html">`
          if (node.nodeName === 'meta' && attrName === 'content') {
            if (
              node.attrMap['http-equiv'] &&
              node.attrMap['http-equiv'].toLowerCase() === 'refresh'
            ) {
              url = parseMetaRefresh(node.attrMap[attrName]).url;
            }
          } else {
            // https://html.spec.whatwg.org/multipage/infrastructure.html#valid-url-potentially-surrounded-by-spaces
            url = node.attrMap[attrName].trim();
          }

          if (url) {
            callback(node, attrName, url);
          }
        }
      }
    }
  });
}

/*
	Traverses the root node to locate preliminary elements/data.

	<base href/>

		Looks for the first instance. If no `href` attribute exists,
		the element is ignored and possible successors are considered.

	<meta name content/>

		Looks for all robot instances and cascades the values.
*/
function findPreliminaries(rootNode, robots) {
  let name;
  const find = {
    base: true,
    robots: !!robots
  };
  const found = {
    base: false
  };
  const result = {
    base: null
  };

  walk(rootNode, node => {
    switch (node.nodeName) {
      // `<base>` can be anywhere, not just within `<head>`
      case 'base': {
        if (find.base === true && found.base === false && !!node.attrMap.href) {
          // https://html.spec.whatwg.org/multipage/infrastructure.html#valid-url-potentially-surrounded-by-spaces
          result.base = node.attrMap.href.trim();

          found.base = true;
        }

        break;
      }
      // `<meta>` can be anywhere
      case 'meta': {
        if (find.robots === true && node.attrMap.name && node.attrMap.content) {
          name = node.attrMap.name.trim().toLowerCase();

          switch (name) {
            case 'description':
            case 'keywords': {
              break;
            }
            // Catches all because we have "robots" and countless botnames such as "googlebot"
            default: {
              if (name === 'robots' || RobotDirectives.isBot(name) === true) {
                robots.meta(name, node.attrMap.content);
              }
            }
          }
        }

        break;
      }
    }

    if (found.base === true && find.robots === false) {
      // Kill walk
      return false;
    }
  });

  return result;
}

/*
	Find the `<html>` element.
*/
function findRootNode(document) {
  let i;
  const rootNodes = document.childNodes;

  for (i = 0; i < rootNodes.length; i++) {
    // Doctypes have no `childNodes` property
    if (rootNodes[i].childNodes) {
      return rootNodes[i];
    }
  }
}

/*
	Find a node's `:nth-child()` index among its siblings.
*/
function getNthIndex(node) {
  let child, i;
  let count = 0;
  const parentsChildren = node.parentNode.childNodes;
  const numParentsChildren = parentsChildren.length;

  for (i = 0; i < numParentsChildren; i++) {
    child = parentsChildren[i];

    if (child !== node) {
      // Exclude text and comments nodes
      if (child.nodeName[0] !== '#') {
        count++;
      }
    } else {
      break;
    }
  }

  // `:nth-child()` indices don't start at 0
  return count + 1;
}

/*
	Builds a CSS selector that matches `node`.
*/
function getSelector(node) {
  let name;
  const selector = [];
  while (node.nodeName !== '#document') {
    name = node.nodeName;
    // Only one of these are ever allowed -- so, index is unnecessary
    if (name !== 'html' && (name !== 'body') & (name !== 'head')) {
      name += ':nth-child(' + getNthIndex(node) + ')';
    }
    // Building backwards
    selector.push(name);
    node = node.parentNode;
  }

  return selector.reverse().join(' > ');
}

function getText(node) {
  let text = null;
  if (node.childNodes.length > 0) {
    text = '';
    walk(node, node => {
      if (node.nodeName === '#text') {
        text += node.value;
      }
    });
    text = condenseWhitespace(text);
  }
  return text;
}

/*
	Serialize an HTML node back to a string.
*/
function stringifyNode(node) {
  let result = '<' + node.nodeName;
  const numAttrs = node.attrs.length;
  for (let i = 0; i < numAttrs; i++) {
    result += ' ' + node.attrs[i].name + '="' + node.attrs[i].value + '"';
  }
  result += '>';
  return result;
}

function walk(node, callback) {
  let childNode, i;
  if (callback(node) === false) return false;
  if (node.childNodes) {
    i = 0;
    childNode = node.childNodes[i];
  }
  while (childNode) {
    if (walk(childNode, callback) === false) return false;
    childNode = node.childNodes[++i];
  }
}

module.exports = scrapeHtml;
