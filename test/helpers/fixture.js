'use strict';
const fs = require('fs');
const pathlib = require('path');

function fixturePath(path) {
  path = path || '';
  return pathlib.resolve(__dirname + '/../fixtures/' + path);
}

function fixtureStream(path) {
  return fs.createReadStream(fixturePath(path));
}

function fixtureString(path) {
  return fs.readFileSync(fixturePath(path), { encoding: 'utf8' });
}

module.exports = {
  path: fixturePath,
  stream: fixtureStream,
  string: fixtureString
};
