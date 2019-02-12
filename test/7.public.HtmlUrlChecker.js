"use strict";
const HtmlUrlChecker = require("../lib/public/HtmlUrlChecker");
const messages = require("../lib/internal/messages");

const helpers = require("./helpers");

const expect = require("chai").expect;

let conn;

describe("PUBLIC -- HtmlUrlChecker", () => {
  before(() => {
    return helpers.startConnection().then(connection => {
      conn = connection;
    });
  });

  after(() => {
    return helpers.stopConnection(conn.realPort);
  });

  describe("methods (#1)", () => {
    describe("enqueue()", () => {
      it("accepts a valid url", () => {
        const id = new HtmlUrlChecker(helpers.options()).enqueue(
          conn.absoluteUrl
        );

        expect(id).to.not.be.an.instanceOf(Error);
      });

      it("rejects an invalid url", () => {
        const id = new HtmlUrlChecker(helpers.options()).enqueue("/path/");

        expect(id).to.be.an.instanceOf(Error);
      });
    });
  });

  describe("handlers", () => {
    it("html", done => {
      new HtmlUrlChecker(helpers.options(), {
        html: function(tree, robots, response, pageUrl, customData) {
          expect(tree).to.be.an.instanceOf(Object);
          expect(robots).to.be.an.instanceOf(Object);
          expect(response).to.be.an.instanceOf(Object);
          expect(pageUrl).to.be.a("string");
          expect(customData).to.be.a("number");
          done();
        }
      }).enqueue(conn.absoluteUrl + "/normal/index.html", 123);
    });

    it("link", done => {
      let count = 0;

      new HtmlUrlChecker(helpers.options(), {
        link: function(result, customData) {
          // HTML has more than one link, so only accept the first
          // to avoid calling `done()` more than once
          if (++count > 1) return;

          expect(arguments).to.have.length(2);
          expect(result).to.be.an.instanceOf(Object);
          expect(customData).to.be.a("number");
          done();
        }
      }).enqueue(conn.absoluteUrl + "/normal/index.html", 123);
    });

    it("page", done => {
      new HtmlUrlChecker(helpers.options(), {
        page: function(error, pageUrl, customData) {
          expect(arguments).to.have.length(3);
          expect(error).to.be.null;
          expect(pageUrl).to.be.a("string");
          expect(customData).to.be.a("number");
          done();
        }
      }).enqueue(conn.absoluteUrl + "/normal/index.html", 123);
    });

    it("end", done => {
      new HtmlUrlChecker(helpers.options(), {
        end: function() {
          expect(arguments).to.have.length(0);
          done();
        }
      }).enqueue(conn.absoluteUrl + "/normal/index.html");
    });
  });

  describe("methods (#2)", () => {
    describe("numActiveLinks()", () => {
      it("works", done => {
        let htmlCalled = false;
        const instance = new HtmlUrlChecker(helpers.options(), {
          html: function() {
            // Give time for link checks to start
            setImmediate(() => {
              expect(instance.numActiveLinks()).to.equal(2);
              htmlCalled = true;
            });
          },
          end: function() {
            expect(htmlCalled).to.be.true;
            expect(instance.numActiveLinks()).to.equal(0);
            done();
          }
        });

        instance.enqueue(conn.absoluteUrl + "/normal/index.html");

        expect(instance.numActiveLinks()).to.equal(0);
      });
    });

    describe("pause() / resume()", () => {
      it("works", done => {
        let resumed = false;

        const instance = new HtmlUrlChecker(helpers.options(), {
          end: function() {
            expect(resumed).to.be.true;
            done();
          }
        });

        instance.pause();

        instance.enqueue(conn.absoluteUrl);

        // Wait longer than scan should take
        setTimeout(() => {
          resumed = true;
          instance.resume();
        }, 100);
      });
    });

    describe("dequeue() / numPages() / numQueuedLinks()", () => {
      it("accepts a valid id", done => {
        const instance = new HtmlUrlChecker(helpers.options(), {
          end: function() {
            expect(instance.numPages()).to.equal(0);
            expect(instance.numQueuedLinks()).to.equal(0);
            done();
          }
        });

        // Prevent first queued item from immediately starting (and thus being auto-dequeued)
        instance.pause();

        const id = instance.enqueue(conn.absoluteUrl + "/normal/index.html");

        expect(id).to.not.be.an.instanceOf(Error);
        expect(instance.numPages()).to.equal(1);
        expect(instance.numQueuedLinks()).to.equal(0);
        expect(instance.dequeue(id)).to.be.true;
        expect(instance.numPages()).to.equal(0);
        expect(instance.numQueuedLinks()).to.equal(0);

        instance.enqueue(conn.absoluteUrl + "/normal/index.html");
        instance.resume();

        // Wait for HTML to be downloaded and parsed
        setImmediate(() => {
          expect(instance.numPages()).to.equal(1);
          expect(instance.numQueuedLinks()).to.equal(2);
        });
      });

      it("rejects an invalid id", () => {
        const instance = new HtmlUrlChecker(helpers.options());

        // Prevent first queued item from immediately starting (and thus being auto-dequeued)
        instance.pause();

        const id = instance.enqueue(conn.absoluteUrl);

        expect(instance.dequeue(id + 1)).to.be.an.instanceOf(Error);
        expect(instance.numPages()).to.equal(1);
      });
    });
  });

  describe("edge cases", () => {
    it("supports custom data", done => {
      let linkCalled = false;
      let pageCalled = false;

      new HtmlUrlChecker(helpers.options(), {
        link: function(result, customData) {
          expect(customData).to.be.an.instanceOf(Object);
          expect(customData.test).to.equal("value");
          linkCalled = true;
        },
        page: function(error, pageUrl, customData) {
          expect(customData).to.be.an.instanceOf(Object);
          expect(customData.test).to.equal("value");
          pageCalled = true;
        },
        end: function() {
          expect(linkCalled).to.be.true;
          expect(pageCalled).to.be.true;
          done();
        }
      }).enqueue(conn.absoluteUrl + "/normal/index.html", { test: "value" });
    });

    it("supports multiple queue items", done => {
      const results = [];

      const instance = new HtmlUrlChecker(helpers.options(), {
        link: function(result, customData) {
          if (results[customData.index] === undefined) {
            results[customData.index] = [];
          }

          results[customData.index][result.html.index] = result;
        },
        end: function() {
          expect(results).to.have.length(2);

          expect(results[0]).to.have.length(2);
          expect(results[0][0].broken).to.be.false; // with-links.html
          expect(results[0][1].broken).to.be.true; // fake.html

          expect(results[1]).to.have.length(2);
          expect(results[1][0].broken).to.be.false; // with-links.html
          expect(results[1][1].broken).to.be.true; // fake.html

          done();
        }
      });

      instance.enqueue(conn.absoluteUrl + "/normal/index.html", { index: 0 });
      instance.enqueue(conn.absoluteUrl + "/normal/index.html", { index: 1 });
    });

    it("supports html with no links", done => {
      let linkCount = 0;
      let pageCalled = false;

      new HtmlUrlChecker(helpers.options(), {
        link: function() {
          linkCount++;
        },
        page: function() {
          pageCalled = true;
        },
        end: function() {
          expect(pageCalled).to.be.true;
          expect(linkCount).to.equal(0);
          done();
        }
      }).enqueue(conn.absoluteUrl + "/normal/no-links.html");
    });

    it("supports pages after html with no links", done => {
      let linkCount = 0;
      let pageCount = 0;

      const instance = new HtmlUrlChecker(helpers.options(), {
        link: function() {
          linkCount++;
        },
        page: function() {
          pageCount++;
        },
        end: function() {
          expect(linkCount).to.equal(2);
          expect(pageCount).to.equal(2);
          done();
        }
      });

      instance.enqueue(conn.absoluteUrl + "/normal/no-links.html");
      instance.enqueue(conn.absoluteUrl + "/normal/index.html");
    });

    it("reports an error when html cannot be retrieved", done => {
      let pageCalled = false;

      new HtmlUrlChecker(helpers.options(), {
        page: function(error, pageUrl) {
          expect(error).to.be.an.instanceOf(Error);
          expect(error.message).to.equal(messages.errors.HTML_RETRIEVAL);
          expect(pageUrl).to.be.a("string");
          pageCalled = true;
        },
        end: function() {
          expect(pageCalled).to.be.true;
          done();
        }
      }).enqueue(conn.absoluteUrl + "/normal/fake.html");
    });

    it("supports pages after html could not be retrieved", done => {
      let pageCount = 0;

      const instance = new HtmlUrlChecker(helpers.options(), {
        page: function(error) {
          if (++pageCount === 1) {
            expect(error).to.be.an.instanceOf(Error);
          } else {
            expect(error).to.not.be.an.instanceOf(Error);
          }
        },
        end: function() {
          expect(pageCount).to.equal(2);
          done();
        }
      });

      instance.enqueue(conn.absoluteUrl + "/normal/fake.html");
      instance.enqueue(conn.absoluteUrl + "/normal/no-links.html");
    });
  });

  describe("options", () => {
    it("honorRobotExclusions = false (header)", done => {
      const results = [];

      new HtmlUrlChecker(helpers.options(), {
        junk: () => {
          done(new Error("this should not have been called"));
        },
        link: function(result) {
          results[result.html.offsetIndex] = result;
        },
        end: function() {
          expect(results).to.have.length(1);
          expect(results[0]).to.be.like({
            broken: false,
            excluded: false,
            excludedReason: null
          });
          done();
        }
      }).enqueue(conn.absoluteUrl + "/disallowed/header.html");
    });

    it("honorRobotExclusions = true (header)", done => {
      const junkResults = [];

      new HtmlUrlChecker(helpers.options({ honorRobotExclusions: true }), {
        junk: function(result) {
          junkResults[result.html.offsetIndex] = result;
        },
        link: () => {
          done(new Error("this should not have been called"));
        },
        end: function() {
          expect(junkResults).to.have.length(1);
          expect(junkResults[0]).to.be.like({
            broken: null,
            excluded: true,
            excludedReason: "BLC_ROBOTS"
          });
          done();
        }
      }).enqueue(conn.absoluteUrl + "/disallowed/header.html");
    });
  });
});
