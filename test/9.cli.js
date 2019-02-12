"use strict";
const helpers = require("./helpers");

let conn;

describe("CLI", () => {
  before(() => {
    return helpers.startConnections().then(connections => {
      conn = connections;
    });
  });

  after(() => {
    return helpers.stopConnections(conn.realPorts);
  });

  it.skip("works", done => {
    done();
  });
});
