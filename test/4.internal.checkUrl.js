'use strict';
const checkUrl = require('../lib/internal/checkUrl');

const helpers = require('./helpers');

const expect = require('chai').expect;
const UrlCache = require('urlcache');
//var urlobj = require("urlobj");

let conn;

describe('INTERNAL -- checkUrl', () => {
  before(() => {
    return helpers.startConnections().then(connections => {
      conn = connections;
    });
  });

  after(() => {
    return helpers.stopConnections(conn.realPorts);
  });

  it('resolves a promise', () => {
    return checkUrl(
      conn.absoluteUrls[0] + '/normal/no-links.html',
      conn.absoluteUrls[0],
      new UrlCache(),
      helpers.options()
    ).then(result => {
      expect(result).to.be.like({
        url: {},
        base: {},
        http: { response: {} },
        html: {}
      });
    });
  });

  describe('shall not be broken with a REAL HOST and REAL PATH from', () => {
    it('an absolute url', () => {
      return checkUrl(
        conn.absoluteUrls[0] + '/normal/no-links.html',
        conn.absoluteUrls[0],
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: conn.absoluteUrls[0] + '/normal/no-links.html',
            resolved: conn.absoluteUrls[0] + '/normal/no-links.html',
            redirected: null
          },
          base: {
            original: conn.absoluteUrls[0],
            resolved: conn.absoluteUrls[0] + '/'
          },
          http: { response: { redirects: [] } },
          broken: false,
          brokenReason: null,
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: false
        });
        expect(result.http.response.redirects).to.have.length(0);
      });
    });

    it('a scheme-relative url', () => {
      return checkUrl(
        conn.relativeUrls[0] + '/normal/no-links.html',
        conn.absoluteUrls[0],
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: conn.relativeUrls[0] + '/normal/no-links.html',
            resolved: conn.absoluteUrls[0] + '/normal/no-links.html',
            redirected: null
          },
          base: {
            original: conn.absoluteUrls[0],
            resolved: conn.absoluteUrls[0] + '/'
          },
          http: { response: { redirects: [] } },
          broken: false,
          brokenReason: null,
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: false
        });
        expect(result.http.response.redirects).to.have.length(0);
      });
    });

    it('a root-path-relative url', () => {
      return checkUrl(
        '/normal/no-links.html',
        conn.absoluteUrls[0],
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: '/normal/no-links.html',
            resolved: conn.absoluteUrls[0] + '/normal/no-links.html',
            redirected: null
          },
          base: {
            original: conn.absoluteUrls[0],
            resolved: conn.absoluteUrls[0] + '/'
          },
          http: { response: { redirects: [] } },
          broken: false,
          brokenReason: null,
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: false
        });
        expect(result.http.response.redirects).to.have.length(0);
      });
    });

    it('a path-relative url', () => {
      return checkUrl(
        'normal/no-links.html',
        conn.absoluteUrls[0],
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: 'normal/no-links.html',
            resolved: conn.absoluteUrls[0] + '/normal/no-links.html',
            redirected: null
          },
          base: {
            original: conn.absoluteUrls[0],
            resolved: conn.absoluteUrls[0] + '/'
          },
          http: { response: { redirects: [] } },
          broken: false,
          brokenReason: null,
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: false
        });
        expect(result.http.response.redirects).to.have.length(0);
      });
    });

    it('a query-relative url', () => {
      return checkUrl(
        '?query',
        conn.absoluteUrls[0] + '/normal/no-links.html',
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: '?query',
            resolved: conn.absoluteUrls[0] + '/normal/no-links.html?query',
            redirected: null
          },
          base: {
            original: conn.absoluteUrls[0] + '/normal/no-links.html',
            resolved: conn.absoluteUrls[0] + '/normal/no-links.html'
          },
          http: { response: { redirects: [] } },
          broken: false,
          brokenReason: null,
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: false
        });
        expect(result.http.response.redirects).to.have.length(0);
      });
    });

    it('a hash-relative url', () => {
      return checkUrl(
        '#hash',
        conn.absoluteUrls[0] + '/normal/no-links.html',
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: '#hash',
            resolved: conn.absoluteUrls[0] + '/normal/no-links.html#hash',
            redirected: null
          },
          base: {
            original: conn.absoluteUrls[0] + '/normal/no-links.html',
            resolved: conn.absoluteUrls[0] + '/normal/no-links.html'
          },
          http: { response: { redirects: [] } },
          broken: false,
          brokenReason: null,
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: true
        });
        expect(result.http.response.redirects).to.have.length(0);
      });
    });

    it('an empty url', () => {
      return checkUrl(
        '',
        conn.absoluteUrls[0] + '/normal/no-links.html',
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: '',
            resolved: conn.absoluteUrls[0] + '/normal/no-links.html',
            redirected: null
          },
          base: {
            original: conn.absoluteUrls[0] + '/normal/no-links.html',
            resolved: conn.absoluteUrls[0] + '/normal/no-links.html'
          },
          http: { response: { redirects: [] } },
          broken: false,
          brokenReason: null,
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: true
        });
        expect(result.http.response.redirects).to.have.length(0);
      });
    });
  });

  describe('shall be broken with a REAL HOST and FAKE PATH from', () => {
    it('an absolute url', () => {
      return checkUrl(
        conn.absoluteUrls[0] + '/normal/fake.html',
        conn.absoluteUrls[0],
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: conn.absoluteUrls[0] + '/normal/fake.html',
            resolved: conn.absoluteUrls[0] + '/normal/fake.html',
            redirected: null
          },
          base: {
            original: conn.absoluteUrls[0],
            resolved: conn.absoluteUrls[0] + '/'
          },
          http: { response: { redirects: [] } },
          broken: true,
          brokenReason: 'HTTP_404',
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: false
        });
        expect(result.http.response.redirects).to.have.length(0);
      });
    });

    it('a scheme-relative url', () => {
      return checkUrl(
        conn.relativeUrls[0] + '/normal/fake.html',
        conn.absoluteUrls[0],
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: conn.relativeUrls[0] + '/normal/fake.html',
            resolved: conn.absoluteUrls[0] + '/normal/fake.html',
            redirected: null
          },
          base: {
            original: conn.absoluteUrls[0],
            resolved: conn.absoluteUrls[0] + '/'
          },
          http: { response: { redirects: [] } },
          broken: true,
          brokenReason: 'HTTP_404',
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: false
        });
        expect(result.http.response.redirects).to.have.length(0);
      });
    });

    it('a root-path-relative url', () => {
      return checkUrl(
        '/normal/fake.html',
        conn.absoluteUrls[0],
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: '/normal/fake.html',
            resolved: conn.absoluteUrls[0] + '/normal/fake.html',
            redirected: null
          },
          base: {
            original: conn.absoluteUrls[0],
            resolved: conn.absoluteUrls[0] + '/'
          },
          http: { response: { redirects: [] } },
          broken: true,
          brokenReason: 'HTTP_404',
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: false
        });
        expect(result.http.response.redirects).to.have.length(0);
      });
    });

    it('a path-relative url', () => {
      return checkUrl(
        'normal/fake.html',
        conn.absoluteUrls[0],
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: 'normal/fake.html',
            resolved: conn.absoluteUrls[0] + '/normal/fake.html',
            redirected: null
          },
          base: {
            original: conn.absoluteUrls[0],
            resolved: conn.absoluteUrls[0] + '/'
          },
          http: { response: { redirects: [] } },
          broken: true,
          brokenReason: 'HTTP_404',
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: false
        });
        expect(result.http.response.redirects).to.have.length(0);
      });
    });

    it('a query-relative url', () => {
      return checkUrl(
        '?query',
        conn.absoluteUrls[0] + '/normal/fake.html',
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: '?query',
            resolved: conn.absoluteUrls[0] + '/normal/fake.html?query',
            redirected: null
          },
          base: {
            original: conn.absoluteUrls[0] + '/normal/fake.html',
            resolved: conn.absoluteUrls[0] + '/normal/fake.html'
          },
          http: { response: { redirects: [] } },
          broken: true,
          brokenReason: 'HTTP_404',
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: false
        });
        expect(result.http.response.redirects).to.have.length(0);
      });
    });

    it('a hash-relative url', () => {
      return checkUrl(
        '#hash',
        conn.absoluteUrls[0] + '/normal/fake.html',
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: '#hash',
            resolved: conn.absoluteUrls[0] + '/normal/fake.html#hash',
            redirected: null
          },
          base: {
            original: conn.absoluteUrls[0] + '/normal/fake.html',
            resolved: conn.absoluteUrls[0] + '/normal/fake.html'
          },
          http: { response: { redirects: [] } },
          broken: true,
          brokenReason: 'HTTP_404',
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: true
        });
        expect(result.http.response.redirects).to.have.length(0);
      });
    });

    it('an empty url', () => {
      return checkUrl(
        '',
        conn.absoluteUrls[0] + '/normal/fake.html',
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: '',
            resolved: conn.absoluteUrls[0] + '/normal/fake.html',
            redirected: null
          },
          base: {
            original: conn.absoluteUrls[0] + '/normal/fake.html',
            resolved: conn.absoluteUrls[0] + '/normal/fake.html'
          },
          http: { response: { redirects: [] } },
          broken: true,
          brokenReason: 'HTTP_404',
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: true
        });
        expect(result.http.response.redirects).to.have.length(0);
      });
    });
  });

  // Technically it's a real host with a fake port, but same goal
  // and faster than testing a remote http://asdf1234.asdf1234
  describe('shall be broken and have error with a FAKE HOST from', () => {
    it('an absolute url', () => {
      return checkUrl(
        conn.fakeAbsoluteUrl + '/path/to/resource.html',
        conn.fakeAbsoluteUrl,
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: conn.fakeAbsoluteUrl + '/path/to/resource.html',
            resolved: conn.fakeAbsoluteUrl + '/path/to/resource.html',
            redirected: null
          },
          base: {
            original: conn.fakeAbsoluteUrl,
            resolved: conn.fakeAbsoluteUrl + '/'
          },
          http: { response: null },
          broken: true,
          brokenReason: 'ERRNO_ECONNREFUSED',
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: false
        });
      });
    });

    it('a scheme-relative url', () => {
      return checkUrl(
        conn.fakeRelativeUrl + '/path/to/resource.html',
        conn.fakeAbsoluteUrl,
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: conn.fakeRelativeUrl + '/path/to/resource.html',
            resolved: conn.fakeAbsoluteUrl + '/path/to/resource.html',
            redirected: null
          },
          base: {
            original: conn.fakeAbsoluteUrl,
            resolved: conn.fakeAbsoluteUrl + '/'
          },
          http: { response: null },
          broken: true,
          brokenReason: 'ERRNO_ECONNREFUSED',
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: false
        });
      });
    });

    it('a root-path-relative url', () => {
      return checkUrl(
        '/path/to/resource.html',
        conn.fakeAbsoluteUrl,
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: '/path/to/resource.html',
            resolved: conn.fakeAbsoluteUrl + '/path/to/resource.html',
            redirected: null
          },
          base: {
            original: conn.fakeAbsoluteUrl,
            resolved: conn.fakeAbsoluteUrl + '/'
          },
          http: { response: null },
          broken: true,
          brokenReason: 'ERRNO_ECONNREFUSED',
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: false
        });
      });
    });

    it('a path-relative url', () => {
      return checkUrl(
        'path/to/resource.html',
        conn.fakeAbsoluteUrl,
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: 'path/to/resource.html',
            resolved: conn.fakeAbsoluteUrl + '/path/to/resource.html',
            redirected: null
          },
          base: {
            original: conn.fakeAbsoluteUrl,
            resolved: conn.fakeAbsoluteUrl + '/'
          },
          http: { response: null },
          broken: true,
          brokenReason: 'ERRNO_ECONNREFUSED',
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: false
        });
      });
    });

    it('a query-relative url', () => {
      return checkUrl(
        '?query',
        conn.fakeAbsoluteUrl + '/path/to/resource.html',
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: '?query',
            resolved: conn.fakeAbsoluteUrl + '/path/to/resource.html?query',
            redirected: null
          },
          base: {
            original: conn.fakeAbsoluteUrl + '/path/to/resource.html',
            resolved: conn.fakeAbsoluteUrl + '/path/to/resource.html'
          },
          http: { response: null },
          broken: true,
          brokenReason: 'ERRNO_ECONNREFUSED',
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: false
        });
      });
    });

    it('a hash-relative url', () => {
      return checkUrl(
        '#hash',
        conn.fakeAbsoluteUrl + '/path/to/resource.html',
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: '#hash',
            resolved: conn.fakeAbsoluteUrl + '/path/to/resource.html#hash',
            redirected: null
          },
          base: {
            original: conn.fakeAbsoluteUrl + '/path/to/resource.html',
            resolved: conn.fakeAbsoluteUrl + '/path/to/resource.html'
          },
          http: { response: null },
          broken: true,
          brokenReason: 'ERRNO_ECONNREFUSED',
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: true
        });
      });
    });

    it('an empty url', () => {
      return checkUrl(
        '',
        conn.fakeAbsoluteUrl + '/path/to/resource.html',
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: '',
            resolved: conn.fakeAbsoluteUrl + '/path/to/resource.html',
            redirected: null
          },
          base: {
            original: conn.fakeAbsoluteUrl + '/path/to/resource.html',
            resolved: conn.fakeAbsoluteUrl + '/path/to/resource.html'
          },
          http: { response: null },
          broken: true,
          brokenReason: 'ERRNO_ECONNREFUSED',
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: true
        });
      });
    });
  });

  describe('shall be broken and have error with NO HOST from', () => {
    it('an absolute url', () => {
      return checkUrl('http://', null, new UrlCache(), helpers.options()).then(
        result => {
          expect(result).to.be.like({
            url: {
              original: 'http://',
              resolved: 'http:///',
              redirected: null
            },
            base: {
              original: null,
              resolved: null
            },
            http: { response: null },
            broken: true,
            //brokenReason: "ERRNO_ECONNRESET",
            excluded: null,
            excludedReason: null,
            internal: null,
            samePage: null
          });

          expect(result.brokenReason).to.satisfy(value => {
            return (
              value === 'ERRNO_ECONNRESET' || // OSX, Node <=5.5.x
              value === 'ERRNO_ENOTFOUND' || // OSX, Node >=5.6.x
              value === 'ERRNO_ECONNREFUSED'
            ); // Linux
          });
        }
      );
    });

    it('a scheme-relative url', () => {
      return checkUrl(
        conn.relativeUrls[0] + '/no-links.html',
        null,
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: conn.relativeUrls[0] + '/no-links.html',
            resolved: null,
            redirected: null
          },
          base: {
            original: null,
            resolved: null
          },
          http: { response: null },
          broken: true,
          brokenReason: 'BLC_INVALID',
          excluded: null,
          excludedReason: null,
          internal: null,
          samePage: null
        });
      });
    });

    it('a root-path-relative url', () => {
      return checkUrl(
        '/normal/no-links.html',
        null,
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: '/normal/no-links.html',
            resolved: null,
            redirected: null
          },
          base: {
            original: null,
            resolved: null
          },
          http: { response: null },
          broken: true,
          brokenReason: 'BLC_INVALID',
          excluded: null,
          excludedReason: null,
          internal: null,
          samePage: null
        });
      });
    });

    it('a path-relative url', () => {
      return checkUrl(
        'normal/no-links.html',
        null,
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: 'normal/no-links.html',
            resolved: null,
            redirected: null
          },
          base: {
            original: null,
            resolved: null
          },
          http: { response: null },
          broken: true,
          brokenReason: 'BLC_INVALID',
          excluded: null,
          excludedReason: null,
          internal: null,
          samePage: null
        });
      });
    });

    it('a query-relative url', () => {
      return checkUrl('?query', null, new UrlCache(), helpers.options()).then(
        result => {
          expect(result).to.be.like({
            url: {
              original: '?query',
              resolved: null,
              redirected: null
            },
            base: {
              original: null,
              resolved: null
            },
            http: { response: null },
            broken: true,
            brokenReason: 'BLC_INVALID',
            excluded: null,
            excludedReason: null,
            internal: null,
            samePage: null
          });
        }
      );
    });

    it('a hash-relative url', () => {
      return checkUrl('#hash', null, new UrlCache(), helpers.options()).then(
        result => {
          expect(result).to.be.like({
            url: {
              original: '#hash',
              resolved: null,
              redirected: null
            },
            base: {
              original: null,
              resolved: null
            },
            http: { response: null },
            broken: true,
            brokenReason: 'BLC_INVALID',
            excluded: null,
            excludedReason: null,
            internal: null,
            samePage: null
          });
        }
      );
    });

    it('an empty url', () => {
      return checkUrl('', null, new UrlCache(), helpers.options()).then(
        result => {
          expect(result).to.be.like({
            url: {
              original: '',
              resolved: null,
              redirected: null
            },
            base: {
              original: null,
              resolved: null
            },
            http: { response: null },
            broken: true,
            brokenReason: 'BLC_INVALID',
            excluded: null,
            excludedReason: null,
            internal: null,
            samePage: null
          });
        }
      );
    });
  });

  describe('shall be broken and have error from', () => {
    it('a data uri', () => {
      return checkUrl(
        'data:image/gif;base64,R0lGODdhAQABAPAAAP///wAAACH/C1hNUCBEYXRhWE1QAz94cAAsAAAAAAEAAQAAAgJEAQA7',
        null,
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original:
              'data:image/gif;base64,R0lGODdhAQABAPAAAP///wAAACH/C1hNUCBEYXRhWE1QAz94cAAsAAAAAAEAAQAAAgJEAQA7',
            resolved: null,
            redirected: null
          },
          base: {
            original: null,
            resolved: null
          },
          http: { response: null },
          broken: true,
          brokenReason: 'BLC_INVALID',
          excluded: null,
          excludedReason: null,
          internal: null,
          samePage: null
        });
      });
    });

    it('a tel uri', () => {
      return checkUrl(
        'tel:+5-555-555-5555',
        null,
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: 'tel:+5-555-555-5555',
            resolved: null,
            redirected: null
          },
          base: {
            original: null,
            resolved: null
          },
          http: { response: null },
          broken: true,
          brokenReason: 'BLC_INVALID',
          excluded: null,
          excludedReason: null,
          internal: null,
          samePage: null
        });
      });
    });
  });

  describe('shall not be broken with a REDIRECTED url', () => {
    it('containing no query or hash', () => {
      return checkUrl(
        conn.absoluteUrls[0] + '/redirect/redirect.html',
        conn.absoluteUrls[0],
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: conn.absoluteUrls[0] + '/redirect/redirect.html',
            resolved: conn.absoluteUrls[0] + '/redirect/redirect.html',
            redirected: conn.absoluteUrls[0] + '/redirect/redirected.html'
          },
          base: {
            original: conn.absoluteUrls[0],
            resolved: conn.absoluteUrls[0] + '/'
          },
          http: { response: { redirects: [] } },
          broken: false,
          brokenReason: null,
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: false
        });
        expect(result.http.response.redirects).to.have.length(2);
      });
    });

    it('containing a query', () => {
      return checkUrl(
        conn.absoluteUrls[0] + '/redirect/redirect.html?query',
        conn.absoluteUrls[0],
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: conn.absoluteUrls[0] + '/redirect/redirect.html?query',
            resolved: conn.absoluteUrls[0] + '/redirect/redirect.html?query',
            redirected: null
          },
          base: {
            original: conn.absoluteUrls[0],
            resolved: conn.absoluteUrls[0] + '/'
          },
          http: { response: { redirects: [] } },
          broken: false,
          brokenReason: null,
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: false
        });
        expect(result.http.response.redirects).to.have.length(0);
      });
    });

    it('containing a hash', () => {
      return checkUrl(
        conn.absoluteUrls[0] + '/redirect/redirect.html#hash',
        conn.absoluteUrls[0],
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          url: {
            original: conn.absoluteUrls[0] + '/redirect/redirect.html#hash',
            resolved: conn.absoluteUrls[0] + '/redirect/redirect.html#hash',
            redirected: conn.absoluteUrls[0] + '/redirect/redirected.html'
          },
          base: {
            original: conn.absoluteUrls[0],
            resolved: conn.absoluteUrls[0] + '/'
          },
          http: { response: { redirects: [] } },
          broken: false,
          brokenReason: null,
          excluded: null,
          excludedReason: null,
          internal: true,
          samePage: false
        });
        expect(result.http.response.redirects).to.have.length(2);
      });
    });
  });

  describe('url object input', () => {
    it.skip('works', () => {});
  });

  describe('caching', () => {
    it('stores the response', () => {
      const cache = new UrlCache();

      return checkUrl(
        conn.absoluteUrls[0] + '/normal/no-links.html',
        conn.absoluteUrls[0],
        cache,
        helpers.options({ cacheResponses: true })
      )
        .then(() => {
          return cache.get(conn.absoluteUrls[0] + '/normal/no-links.html');
        })
        .then(response => {
          expect(response).to.be.an('object');
        });
    });

    it('stores the response of a redirected url', () => {
      const cache = new UrlCache();

      return checkUrl(
        conn.absoluteUrls[0] + '/redirect/redirect.html',
        conn.absoluteUrls[0],
        cache,
        helpers.options({ cacheResponses: true })
      )
        .then(() => {
          return cache.get(conn.absoluteUrls[0] + '/redirect/redirect.html');
        })
        .then(response => {
          expect(response).to.be.an('object');
        })
        .then(() => {
          return cache.get(conn.absoluteUrls[0] + '/redirect/redirected.html');
        })
        .then(response => {
          expect(response).to.be.an('object');
        });
    });

    // NOTE :: not stored because we check first
    it('does not store the error from an erroneous url', () => {
      const cache = new UrlCache();

      return checkUrl(
        '/normal/fake.html',
        null,
        cache,
        helpers.options({ cacheResponses: true })
      )
        .then(() => {
          return cache.get('/normal/fake.html');
        })
        .then(response => {
          expect(response).to.be.undefined;
        });
    });

    it('requests a unique url only once', () => {
      const cache = new UrlCache();

      return checkUrl(
        conn.absoluteUrls[0] + '/normal/no-links.html',
        conn.absoluteUrls[0],
        cache,
        helpers.options({ cacheResponses: true })
      )
        .then(() => {
          return cache.get(conn.absoluteUrls[0] + '/normal/no-links.html');
        })
        .then(response => {
          response._cached = true;
        })
        .then(() => {
          // Check URL again
          return checkUrl(
            conn.absoluteUrls[0] + '/normal/no-links.html',
            conn.absoluteUrls[0],
            cache,
            helpers.options({ cacheResponses: true })
          );
        })
        .then(() => {
          return cache.get(conn.absoluteUrls[0] + '/normal/no-links.html');
        })
        .then(response => {
          expect(response._cached).to.be.true;
        });
    });
  });

  describe('options', () => {
    it.skip('acceptedSchemes = []', () => {});

    it('retry405Head = false', () => {
      return checkUrl(
        conn.absoluteUrls[0] + '/method-not-allowed/head.html',
        conn.absoluteUrls[0],
        new UrlCache(),
        helpers.options()
      ).then(result => {
        expect(result).to.be.like({
          broken: true,
          brokenReason: 'HTTP_405',
          excluded: null,
          excludedReason: null
        });
      });
    });

    it('retry405Head = false (#2)', () => {
      return checkUrl(
        conn.absoluteUrls[0] + '/method-not-allowed/any.html',
        conn.absoluteUrls[0],
        new UrlCache(),
        helpers.options({ requestMethod: 'get' })
      ).then(result => {
        expect(result).to.be.like({
          broken: true,
          brokenReason: 'HTTP_405',
          excluded: null,
          excludedReason: null
        });
      });
    });

    it('retry405Head = true', () => {
      return checkUrl(
        conn.absoluteUrls[0] + '/method-not-allowed/head.html',
        conn.absoluteUrls[0],
        new UrlCache(),
        helpers.options({ retry405Head: true })
      ).then(result => {
        expect(result).to.be.like({
          broken: false,
          brokenReason: null,
          excluded: null,
          excludedReason: null
        });
      });
    });

    it('retry405Head = true (#2)', () => {
      return checkUrl(
        conn.absoluteUrls[0] + '/method-not-allowed/any.html',
        conn.absoluteUrls[0],
        new UrlCache(),
        helpers.options({ retry405Head: true })
      ).then(result => {
        expect(result).to.be.like({
          broken: true,
          brokenReason: 'HTTP_405',
          excluded: null,
          excludedReason: null
        });
      });
    });
  });
});
