"use strict";
const messages = require("../lib/internal/messages");
const streamHtml = require("../lib/internal/streamHtml");

const helpers = require("./helpers");

const expect = require("chai").expect;
const isStream = require("is-stream");
const UrlCache = require("urlcache");

let conn;

describe("INTERNAL -- streamHtml", () => {
  before(() => {
    return helpers.startConnection().then(connection => {
      conn = connection;
    });
  });

  after(() => {
    return helpers.stopConnection(conn.realPort);
  });

  it("works", () => {
    return streamHtml(
      conn.absoluteUrl + "/normal/no-links.html",
      null,
      helpers.options()
    ).then(result => {
      expect(isStream(result.stream)).to.be.true;
      expect(result.response.url).to.equal(
        conn.absoluteUrl + "/normal/no-links.html"
      );
    });
  });

  it("reports a redirect", () => {
    return streamHtml(
      conn.absoluteUrl + "/redirect/redirect.html",
      null,
      helpers.options()
    ).then(result => {
      expect(isStream(result.stream)).to.be.true;
      expect(result.response.url).to.equal(
        conn.absoluteUrl + "/redirect/redirected.html"
      );
    });
  });

  it("rejects a non-html url (gif)", () => {
    let accepted = false;

    return streamHtml(
      conn.absoluteUrl + "/non-html/image.gif",
      null,
      helpers.options()
    )
      .then(() => {
        accepted = new Error("this should not have been called");
      })
      .catch(error => {
        expect(error).to.be.an.instanceOf(Error);
        expect(error.message).to.equal(
          messages.errors.EXPECTED_HTML("image/gif")
        );
      })
      .then(() => {
        if (accepted !== false) throw accepted;
      });
  });

  it("rejects a non-html url (unknown)", () => {
    let accepted = false;

    return streamHtml(
      conn.absoluteUrl + "/non-html/empty",
      null,
      helpers.options()
    )
      .then(() => {
        accepted = new Error("this should not have been called");
      })
      .catch(error => {
        expect(error).to.be.an.instanceOf(Error);
        expect(error.message).to.equal(
          messages.errors.EXPECTED_HTML(undefined)
        );
      })
      .then(() => {
        if (accepted !== false) throw accepted;
      });
  });

  it("rejects a 404", () => {
    let accepted = false;

    return streamHtml(
      conn.absoluteUrl + "/normal/fake.html",
      null,
      helpers.options()
    )
      .then(() => {
        accepted = new Error("this should not have been called");
      })
      .catch(error => {
        expect(error).to.be.an.instanceOf(Error);
        expect(error.message).to.equal(messages.errors.HTML_RETRIEVAL);
      })
      .then(() => {
        if (accepted !== false) throw accepted;
      });
  });

  it("rejects an erroneous url", () => {
    let accepted = false;

    return streamHtml("/normal/fake.html", null, helpers.options())
      .then(() => {
        accepted = new Error("this should not have been called");
      })
      .catch(error => {
        expect(error).to.be.an.instanceOf(Error);
        //expect(error.message).to.equal("Invalid URL");  // TODO :: https://github.com/joepie91/node-bhttp/issues/4
      })
      .then(() => {
        if (accepted !== false) throw accepted;
      });
  });

  // NOTE :: cache is not stored for use in `streamHtml()`, but instead for any wrapping functions
  // As a result, the cached responses are not retrieved and checked to be non-unique
  describe("caching", () => {
    it("stores the response", () => {
      const cache = new UrlCache();

      return streamHtml(
        conn.absoluteUrl + "/normal/no-links.html",
        cache,
        helpers.options({ cacheResponses: true })
      )
        .then(() => {
          return cache.get(conn.absoluteUrl + "/normal/no-links.html");
        })
        .then(response => {
          expect(response).to.be.an("object");
        });
    });

    it("stores the response of a redirected url", () => {
      const cache = new UrlCache();

      return streamHtml(
        conn.absoluteUrl + "/redirect/redirect.html",
        cache,
        helpers.options({ cacheResponses: true })
      )
        .then(() => {
          return cache.get(conn.absoluteUrl + "/redirect/redirect.html");
        })
        .then(response => {
          expect(response).to.be.an("object");

          return cache.get(conn.absoluteUrl + "/redirect/redirected.html");
        })
        .then(response => {
          expect(response).to.be.an("object");
        });
    });

    it("stores the response of a non-html url", () => {
      const cache = new UrlCache();

      return streamHtml(
        conn.absoluteUrl + "/non-html/image.gif",
        cache,
        helpers.options({ cacheResponses: true })
      )
        .catch(() => {
          // "Unsupported type", etc, error
        })
        .then(() => {
          return cache.get(conn.absoluteUrl + "/non-html/image.gif");
        })
        .then(response => {
          expect(response).to.be.an("object");
          expect(response).to.not.be.an.instanceOf(Error);
        });
    });

    it("stores the response of a 404", () => {
      const cache = new UrlCache();

      return streamHtml(
        conn.absoluteUrl + "/normal/fake.html",
        cache,
        helpers.options({ cacheResponses: true })
      )
        .catch(() => {
          // "HTML not retrieved", etc, error
        })
        .then(() => {
          return cache.get(conn.absoluteUrl + "/normal/fake.html");
        })
        .then(response => {
          expect(response).to.be.an("object");
          expect(response).to.not.be.an.instanceOf(Error);
        });
    });

    it("stores the error from an erroneous url", () => {
      const cache = new UrlCache();

      return streamHtml(
        "/normal/fake.html",
        cache,
        helpers.options({ cacheResponses: true })
      )
        .catch(() => {
          // "Invalid URL", etc, error
        })
        .then(() => {
          return cache.get("/normal/fake.html");
        })
        .then(response => {
          expect(response).to.be.an.instanceOf(Error);
          //expect(response.message).to.equal("Invalid URL");  // TODO :: https://github.com/joepie91/node-bhttp/issues/4
        });
    });
  });
});
