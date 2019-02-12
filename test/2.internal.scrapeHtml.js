"use strict";
const parseHtml = require("../lib/internal/parseHtml");
const scrapeHtml = require("../lib/internal/scrapeHtml");

const helpers = require("./helpers");
const tagTests = require("./helpers/json/scrapeHtml.json");

const expect = require("chai").expect;

function wrapper(input, robots) {
  return parseHtml(input).then(document => {
    return scrapeHtml(document, robots);
  });
}

describe("INTERNAL -- parseHtml / scrapeHtml", () => {
  it("supports a string", () => {
    return wrapper("<html></html>").then(links => {
      expect(links).to.be.an.instanceOf(Array);
    });
  });

  it("supports a stream", () => {
    return wrapper(helpers.fixture.stream("/normal/no-links.html")).then(
      links => {
        expect(links).to.be.an.instanceOf(Array);
      }
    );
  });

  describe("link tags & attributes", () => {
    for (const test in tagTests) {
      let code = "";
      const data = tagTests[test];
      const skipOrOnly =
        data.skipOrOnly === null || data.skipOrOnly === undefined
          ? ""
          : "." + data.skipOrOnly;

      code +=
        "it" +
        skipOrOnly +
        '("supports ' +
        helpers.addSlashes(test) +
        '", function()\n';
      code += "{\n";
      code +=
        '	return wrapper("' +
        helpers.addSlashes(data.html) +
        '").then( function(links)\n';
      code += "	{\n";
      code += "		expect(links).to.have.length(" + data.length + ");\n";
      code +=
        "		expect(links[0]).to.be.like(" +
        JSON.stringify(data.link, null, "\t") +
        ");\n";
      code += "	});\n";
      code += "});\n";

      eval(code);
    }
  });

  describe("edge cases", () => {
    it('ignores <meta content/> lacking http-equiv="refresh"', () => {
      return wrapper('<meta http-equiv="other" content="5; url=fake.html"/>')
        .then(links => {
          expect(links).to.be.empty;

          return wrapper('<meta content="5; url=fake.html"/>');
        })
        .then(links => {
          expect(links).to.be.empty;
        });
    });

    it("supports link attributes with values surrounded by spaces", () => {
      return wrapper('<a href=" fake.html ">link</a>').then(links => {
        expect(links).to.have.length(1);
        expect(links[0]).to.be.like({
          url: { original: "fake.html" },
          html: { tag: '<a href=" fake.html ">' }
        });
      });
    });

    it("supports link attributes preceded by non-link attributes", () => {
      return wrapper('<a id="link" href="fake.html">link</a>').then(links => {
        expect(links).to.have.length(1);
        expect(links[0]).to.be.like({
          url: { original: "fake.html" },
          html: {
            attrName: "href",
            attrs: { href: "fake.html", id: "link" },
            tag: '<a id="link" href="fake.html">'
          }
        });
      });
    });

    it("supports consecutive link attributes", () => {
      return wrapper('<img src="fake.png" longdesc="fake.html"/>').then(
        links => {
          expect(links).to.have.length(2);
          expect(links).to.be.like([
            {
              url: { original: "fake.png" },
              html: {
                selector: "html > body > img:nth-child(1)",
                tagName: "img",
                attrName: "src",
                tag: '<img src="fake.png" longdesc="fake.html">'
              }
            },
            {
              url: { original: "fake.html" },
              html: {
                selector: "html > body > img:nth-child(1)",
                tagName: "img",
                attrName: "longdesc",
                tag: '<img src="fake.png" longdesc="fake.html">'
              }
            }
          ]);
        }
      );
    });

    it("ignores redundant link attributes", () => {
      return wrapper('<a href="fake.html" href="ignored.html">link</a>').then(
        links => {
          expect(links.length).to.equal(1);
          expect(links[0]).to.be.like({
            url: { original: "fake.html" },
            html: {
              attrName: "href",
              tag: '<a href="fake.html">'
            }
          });
        }
      );
    });

    it("supports consecutive link elements", () => {
      return wrapper(
        '<a href="fake1.html">link1</a> <a href="fake2.html">link2</a>'
      ).then(links => {
        expect(links).to.have.length(2);
        expect(links).to.be.like([
          {
            url: { original: "fake1.html" },
            html: {
              selector: "html > body > a:nth-child(1)",
              tag: '<a href="fake1.html">',
              text: "link1"
            }
          },
          {
            url: { original: "fake2.html" },
            html: {
              selector: "html > body > a:nth-child(2)",
              tag: '<a href="fake2.html">',
              text: "link2"
            }
          }
        ]);
      });
    });

    it("supports nonconsecutive link elements", () => {
      let html = '<a href="fake1.html">link1</a>';
      html += "content <span>content</span> content";
      html += '<a href="fake2.html">link2</a>';

      return wrapper(html).then(links => {
        expect(links).to.have.length(2);
        expect(links).to.be.like([
          {
            url: { original: "fake1.html" },
            html: {
              selector: "html > body > a:nth-child(1)",
              tag: '<a href="fake1.html">',
              text: "link1"
            }
          },
          {
            url: { original: "fake2.html" },
            html: {
              selector: "html > body > a:nth-child(3)",
              tag: '<a href="fake2.html">',
              text: "link2"
            }
          }
        ]);
      });
    });

    it("supports nested link elements", () => {
      return wrapper(
        '<a href="fake1.html"><q cite="fake2.html">quote</q></a>'
      ).then(links => {
        expect(links).to.have.length(2);
        expect(links).to.be.like([
          {
            url: { original: "fake1.html" },
            html: {
              selector: "html > body > a:nth-child(1)",
              tagName: "a",
              attrName: "href",
              tag: '<a href="fake1.html">',
              text: "quote"
            }
          },
          {
            url: { original: "fake2.html" },
            html: {
              selector: "html > body > a:nth-child(1) > q:nth-child(1)",
              tagName: "q",
              attrName: "cite",
              tag: '<q cite="fake2.html">',
              text: "quote"
            }
          }
        ]);
      });
    });

    it("supports link elements with nested elements", () => {
      return wrapper('<a href="fake.html"><span>text</span></a>').then(
        links => {
          expect(links).to.have.length(1);
          expect(links[0]).to.be.like({
            url: { original: "fake.html" },
            html: {
              selector: "html > body > a:nth-child(1)",
              tagName: "a",
              attrName: "href",
              tag: '<a href="fake.html">',
              text: "text"
            }
          });
        }
      );
    });

    it("supports void elements", () => {
      return wrapper('<img src="fake.png"> content').then(links => {
        expect(links).to.have.length(1);
        expect(links[0]).to.be.like({
          url: { original: "fake.png" },
          html: {
            selector: "html > body > img:nth-child(1)",
            tagName: "img",
            attrName: "src",
            tag: '<img src="fake.png">',
            text: null
          }
        });
      });
    });

    it("supports detailed selectors and omit nth-child from html and body", () => {
      let html = "<html><head><title>title</title></head><body>";
      html += '<div><a href="fake1.html">link1</a>';
      html += '<div><a href="fake2.html">link2</a></div>';
      html += '<div><a href="fake3.html">link3</a></div>';
      html += '<a href="fake4.html">link4</a></div>';
      html += '<a href="fake5.html">link5</a>';
      html += "</body></html>";

      return wrapper(html).then(links => {
        expect(links).to.have.length(5);
        expect(links).to.be.like([
          {
            url: { original: "fake1.html" },
            html: {
              selector: "html > body > div:nth-child(1) > a:nth-child(1)",
              tag: '<a href="fake1.html">',
              text: "link1"
            }
          },
          {
            url: { original: "fake2.html" },
            html: {
              selector:
                "html > body > div:nth-child(1) > div:nth-child(2) > a:nth-child(1)",
              tag: '<a href="fake2.html">',
              text: "link2"
            }
          },
          {
            url: { original: "fake3.html" },
            html: {
              selector:
                "html > body > div:nth-child(1) > div:nth-child(3) > a:nth-child(1)",
              tag: '<a href="fake3.html">',
              text: "link3"
            }
          },
          {
            url: { original: "fake4.html" },
            html: {
              selector: "html > body > div:nth-child(1) > a:nth-child(4)",
              tag: '<a href="fake4.html">',
              text: "link4"
            }
          },
          {
            url: { original: "fake5.html" },
            html: {
              selector: "html > body > a:nth-child(2)",
              tag: '<a href="fake5.html">',
              text: "link5"
            }
          }
        ]);
      });
    });

    it("supports link attribute source code locations", () => {
      const html = '\n\t<a href="fake.html">link</a>';

      return wrapper(html).then(links => {
        expect(links).to.have.length(1);
        expect(links[0]).to.be.like({
          html: {
            location: {
              line: 2,
              col: 5,
              startOffset: 5,
              endOffset: 21
            }
          }
        });

        const location = links[0].html.location;
        const line = location.line - 1;
        const start = location.startOffset - 1 + (location.col - 1);
        const end = location.endOffset - 1;

        expect(html.split("\n")[line].substring(start, end)).to.equal(
          '="fake.html"'
        );
      });
    });

    it("supports <base/>", () => {
      return wrapper(
        '<head><base href="/fake/"/></head> <a href="fake.html">link</a>'
      ).then(links => {
        expect(links).to.have.length(1);
        expect(links[0]).to.be.like({
          url: { original: "fake.html" },
          html: { base: "/fake/" }
        });
      });
    });

    it("supports irregular uses of <base/>", () => {
      let html = '<base href="/correct/"/>';
      html += '<a href="fake.html">link</a>';

      return wrapper(html).then(links => {
        expect(links).to.have.length(1);
        expect(links[0]).to.be.like({
          url: { original: "fake.html" },
          html: { base: "/correct/" }
        });
      });
    });

    it("ignores multiple uses of <base/>", () => {
      let html = '<base href="/first/"/>';
      html += '<head><base href="/ignored1/"/><base href="/ignored2/"/></head>';
      html += '<head><base href="/ignored3/"/></head>';
      html += '<base href="/ignored4/"/>';
      html += '<a href="fake.html">link</a>';

      return wrapper(html).then(links => {
        expect(links).to.have.length(1);
        expect(links[0]).to.be.like({
          url: { original: "fake.html" },
          html: { base: "/first/" }
        });
      });
    });

    it("supports invalid html structure", () => {
      let html = "<html><head><title>title</title></head><body>";
      html += "<table>";
      html += '<p><div><a href="fake1.html">link<b>1</div></a></b>';
      html += "<tr><td>content</td></tr></table>";
      html += '<a href="fake2.html">link2</a>';
      html += "</wtf></body></html>";

      return wrapper(html).then(links => {
        expect(links).to.have.length(2);
        expect(links).to.be.like([
          {
            url: { original: "fake1.html" },
            html: {
              selector: "html > body > div:nth-child(2) > a:nth-child(1)",
              tag: '<a href="fake1.html">',
              text: "link1"
            }
          },
          {
            url: { original: "fake2.html" },
            html: {
              selector: "html > body > a:nth-child(4)",
              tag: '<a href="fake2.html">',
              text: "link2"
            }
          }
        ]);
      });
    });

    it("supports invalid html structure (#2)", () => {
      let html = "<html><head><title>title</title></head><body>";
      html += '<a href="fake.html">1<p>2</a>';
      html += "</body></html>";

      return wrapper(html).then(links => {
        expect(links).to.have.length(2);
        expect(links).to.be.like([
          {
            url: { original: "fake.html" },
            html: {
              selector: "html > body > a:nth-child(1)",
              tag: '<a href="fake.html">',
              text: "1"
            }
          },
          {
            url: { original: "fake.html" },
            html: {
              selector: "html > body > p:nth-child(2) > a:nth-child(1)",
              tag: '<a href="fake.html">',
              text: "2"
            }
          }
        ]);
      });
    });

    it('fires "complete" when no links found', () => {
      return wrapper("no links here").then(links => {
        expect(links).to.have.length(0);
      });
    });
  });
});
