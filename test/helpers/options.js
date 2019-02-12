'use strict';
const appDefaultOptions = require('../../src/internal/defaultOptions');
const parseOptions = require('../../src/internal/parseOptions');

const testDefaultOptions = {
  // All other options will use default values
  // as this will ensure that when they change, tests WILL break
  cacheResponses: false,
  excludeInternalLinks: false,
  excludeLinksToSamePage: false,
  filterLevel: 3,
  honorRobotExclusions: false,
  maxSockets: Infinity,
  maxSocketsPerHost: Infinity,
  retry405Head: false
};

function options(overrides) {
  overrides = Object.assign(
    {},
    appDefaultOptions,
    testDefaultOptions,
    overrides
  );

  return parseOptions(overrides);
}

module.exports = options;
