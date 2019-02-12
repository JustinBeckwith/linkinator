'use strict';
const UrlChecker = require('../src/public/UrlChecker');

const helpers = require('./helpers');

const expect = require('chai').expect;

let conn;

describe('PUBLIC -- UrlChecker', () => {
  before(() => {
    return helpers.startConnection().then(connection => {
      conn = connection;
    });
  });

  after(() => {
    return helpers.stopConnection(conn.realPort);
  });

  describe('methods (#1)', () => {
    describe('enqueue()', () => {
      it('accepts a valid url', () => {
        const instance = new UrlChecker(helpers.options());
        expect(instance.enqueue(conn.absoluteUrl)).to.not.be.an.instanceOf(
          Error
        );
        expect(
          instance.enqueue('/normal/no-links.html', conn.absoluteUrl)
        ).to.not.be.an.instanceOf(Error);
      });

      it('rejects an invalid url', () => {
        const id = new UrlChecker(helpers.options()).enqueue('/path/');
        expect(id).to.be.an.instanceOf(Error);
      });
    });
  });

  describe('handlers', () => {
    it('link', done => {
      new UrlChecker(helpers.options(), {
        link: function(result, customData) {
          expect(arguments).to.have.length(2);
          expect(result).to.be.an.instanceOf(Object);
          expect(customData).to.be.undefined;
          done();
        }
      }).enqueue(conn.absoluteUrl);
    });

    it('end', done => {
      new UrlChecker(helpers.options(), {
        end: function() {
          expect(arguments).to.have.length(0);
          done();
        }
      }).enqueue(conn.absoluteUrl);
    });
  });

  describe('methods (#2)', () => {
    describe('numActiveLinks()', () => {
      it('works', done => {
        const instance = new UrlChecker(helpers.options(), {
          end: function() {
            expect(instance.numActiveLinks()).to.equal(0);
            done();
          }
        });

        instance.enqueue(conn.absoluteUrl);
        instance.enqueue('/normal/no-links.html', conn.absoluteUrl);

        expect(instance.numActiveLinks()).to.equal(2);
      });
    });

    describe('pause() / resume()', () => {
      it('works', done => {
        let resumed = false;

        const instance = new UrlChecker(helpers.options(), {
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

    describe('dequeue() / numQueuedLinks()', () => {
      it('accepts a valid id', done => {
        const instance = new UrlChecker(helpers.options(), {
          end: function() {
            expect(instance.numQueuedLinks()).to.equal(0);
            done();
          }
        });

        // Prevent first queued item from immediately starting (and thus being auto-dequeued)
        instance.pause();

        const id = instance.enqueue(conn.absoluteUrl);

        expect(id).to.not.be.an.instanceOf(Error);
        expect(instance.numQueuedLinks()).to.equal(1);
        expect(instance.dequeue(id)).to.be.true;
        expect(instance.numQueuedLinks()).to.equal(0);

        instance.enqueue(conn.absoluteUrl);
        instance.resume();
      });

      it('rejects an invalid id', () => {
        const instance = new UrlChecker(helpers.options());

        // Prevent first queued item from immediately starting (and thus being auto-dequeued)
        instance.pause();

        const id = instance.enqueue(conn.absoluteUrl);

        expect(instance.dequeue(id + 1)).to.be.an.instanceOf(Error);
        expect(instance.numQueuedLinks()).to.equal(1);
      });
    });
  });

  describe('caching', () => {
    it('requests a unique url only once', done => {
      const options = helpers.options({ cacheResponses: true });
      const results = [];
      let success = false;

      const instance = new UrlChecker(options, {
        link: function(result, customData) {
          if (result.http.response._cached === true) {
            success = true;
          }

          result.http.response._cached = true;
          results[customData.index] = result;
        },
        end: function() {
          expect(success).to.equal(true);
          expect(results).to.have.length(3);
          done();
        }
      });

      instance.enqueue(conn.absoluteUrl + '/normal/index.html', null, {
        index: 0
      });
      instance.enqueue(conn.absoluteUrl + '/normal/index.html', null, {
        index: 1
      });
      instance.enqueue(conn.absoluteUrl + '/normal/no-links.html', null, {
        index: 2
      });
    });

    it('re-requests a non-unique url after clearing cache', done => {
      let finalFired = false;
      const options = helpers.options({ cacheResponses: true });
      const results = [];

      const instance = new UrlChecker(options, {
        link: function(result, customData) {
          if (result.http.response._cached === true) {
            done(new Error('this should not have been a cached result'));
          }

          result.http.response._cached = true;
          results[customData.index] = result;
        },
        end: function() {
          if (finalFired === true) {
            expect(results).to.have.length(3);
            done();
          } else {
            instance.clearCache();
            instance.enqueue(conn.absoluteUrl + '/normal/no-links.html', null, {
              index: 2
            });
            finalFired = true;
          }
        }
      });

      instance.enqueue(conn.absoluteUrl + '/normal/index.html', null, {
        index: 0
      });
      instance.enqueue(conn.absoluteUrl + '/normal/no-links.html', null, {
        index: 1
      });
    });

    it('re-requests a non-unique url after expiring in cache', done => {
      let finalFired = false;
      const options = helpers.options({
        cacheExpiryTime: 50,
        cacheResponses: true
      });
      const results = [];

      const instance = new UrlChecker(options, {
        link: function(result, customData) {
          if (result.http.response._cached === true) {
            done(new Error('this should not have been a cached result'));
          }

          result.http.response._cached = true;
          results[customData.index] = result;
        },
        end: function() {
          if (finalFired === true) {
            expect(results).to.have.length(2);
            done();
          } else {
            setTimeout(() => {
              instance.enqueue(
                conn.absoluteUrl + '/normal/no-links.html',
                null,
                { index: 1 }
              );
              finalFired = true;
            }, 100);
          }
        }
      });

      instance.enqueue(conn.absoluteUrl + '/normal/no-links.html', null, {
        index: 0
      });
    });
  });

  describe('edge cases', () => {
    it('supports a relative url', done => {
      new UrlChecker(helpers.options(), {
        link: function(result) {
          expect(result).to.be.like({
            url: {
              original: '/normal/no-links.html',
              resolved: conn.absoluteUrl + '/normal/no-links.html'
            },
            base: {
              original: conn.absoluteUrl
            }
          });
          done();
        }
      }).enqueue('/normal/no-links.html', conn.absoluteUrl);
    });

    it('supports custom data', done => {
      new UrlChecker(helpers.options(), {
        link: function(result, customData) {
          expect(customData).to.deep.equal({ test: 'value' });
          done();
        }
      }).enqueue(conn.absoluteUrl, null, { test: 'value' });
    });

    it('supports multiple queue items', done => {
      const results = [];

      const instance = new UrlChecker(helpers.options(), {
        link: function(result, customData) {
          results[customData.index] = result;
        },
        end: function() {
          expect(results).to.have.length(3);
          expect(results).to.be.like([
            { url: { original: conn.absoluteUrl + '/normal/index.html' } },
            { url: { original: conn.absoluteUrl + '/normal/no-links.html' } },
            { url: { original: conn.absoluteUrl + '/normal/fake.html' } }
          ]);
          done();
        }
      });

      instance.enqueue(conn.absoluteUrl + '/normal/index.html', null, {
        index: 0
      });
      instance.enqueue(conn.absoluteUrl + '/normal/no-links.html', null, {
        index: 1
      });
      instance.enqueue(conn.absoluteUrl + '/normal/fake.html', null, {
        index: 2
      });
    });
  });
});
