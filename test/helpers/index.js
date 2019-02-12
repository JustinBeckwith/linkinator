'use strict';
const server = require('./server');
const testGenerator = require('./testGenerator');

const chai = require('chai');
chai.config.includeStack = true;
chai.use(require('chai-as-promised'));
chai.use(require('chai-like'));
chai.use(require('chai-things'));

module.exports = {
  a_an: testGenerator.a_an,
  addSlashes: testGenerator.addSlashes,
  format: testGenerator.format,
  //italic:     testGenerator.italic,

  options: require('./options'),

  startConnection: server.startConnection,
  startConnections: server.startConnections,
  stopConnection: server.stopConnection,
  stopConnections: server.stopConnections,

  tagsString: require('./tagsString'),

  fixture: require('./fixture')
};
