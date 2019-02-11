"use strict";
const helpers = require("./helpers");

const expect = require("chai").expect;

let conn;

describe("CLI", function() {
  before(function() {
    return helpers.startConnections().then(function(connections) {
      conn = connections;
    });
  });

  after(function() {
    return helpers.stopConnections(conn.realPorts);
  });

  it.skip("works", function(done) {
    done();
  });
});
