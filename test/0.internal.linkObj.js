'use strict';
const linkObj = require('../src/internal/linkObj');

const helpers = require('./helpers');
const urlTests = require('./helpers/json/linkObj.json');

const expect = require('chai').expect;

const options = helpers.options();

describe('INTERNAL -- linkObj', () => {
  describe('linkObj()', () => {
    it('works', () => {
      const link = linkObj('http://fakeurl.com/');

      expect(link).to.be.like({
        base: {},
        broken_link_checker: true,
        html: {},
        http: {},
        url: {}
      });
    });
  });

  describe('linkObj.clean()', () => {
    it('works', () => {
      const link = linkObj('http://fakeurl.com');

      linkObj.clean(link);

      expect(link.broken_link_checker).to.be.undefined;
    });
  });

  describe('linkObj.resolve()', () => {
    it('works', () => {
      const linkUrl = 'http://fakeurl.com';
      const link = linkObj(linkUrl);

      linkObj.resolve(link, linkUrl, options);

      expect(link).to.be.like({
        url: {
          original: linkUrl,
          resolved: linkUrl + '/',
          redirected: null,
          parsed: { protocol: 'http:' }
        },
        base: {
          original: linkUrl,
          resolved: linkUrl + '/',
          parsed: {}
        },
        html: { tag: null }, // No HTML has been parsed
        http: { response: null }, // No request has been made
        internal: true,
        samePage: true,
        broken: null,
        brokenReason: null,
        excluded: null,
        excludedReason: null,
        broken_link_checker: true
      });
    });

    for (const test in urlTests) {
      let code = '';
      const data = urlTests[test];
      const skipOrOnly =
        data.skipOrOnly === null || data.skipOrOnly === undefined
          ? ''
          : '.' + data.skipOrOnly;
      const title =
        (data.resolvedUrl !== null ? 'accepts ' : 'rejects ') +
        helpers.a_an(test) +
        ' ' +
        helpers.addSlashes(test);

      code += 'it' + skipOrOnly + '("' + title + '", function()\n';
      code += '{\n';
      code += '	var baseUrl     = ' + helpers.format(data.baseUrl) + ';\n';
      code += '	var htmlBaseUrl = ' + helpers.format(data.htmlBaseUrl) + ';\n';
      code += '	var linkUrl     = ' + helpers.format(data.linkUrl) + ';\n';
      code += '	\n';
      code += '	var link = linkObj(linkUrl);\n';
      code +=
        '	if (typeof htmlBaseUrl==="string") link.html.base = htmlBaseUrl;\n';
      code += '	\n';
      code += '	linkObj.resolve(link, baseUrl, options);\n';
      code += '	\n';
      code += '	expect(link.url.original).to.equal(linkUrl);\n';
      code +=
        '	expect(link.url.resolved).to.equal(' +
        helpers.format(data.resolvedLinkUrl) +
        ');\n';
      code += '	\n';
      code += '	expect(link.base.original).to.equal(baseUrl);\n';
      code +=
        '	expect(link.base.resolved).to.equal(' +
        helpers.format(data.resolvedBaseUrl) +
        ');\n';
      code += '	\n';
      code +=
        '	if (typeof htmlBaseUrl==="string") expect(link.html.base).to.equal(htmlBaseUrl);\n';
      code += '	\n';
      code += '	expect(link.internal).to.be.' + data.internal + ';\n';
      code += '	expect(link.samePage).to.be.' + data.samePage + ';\n';
      code += '});\n';

      eval(code);
    }

    it('accepts a base with a scheme/protocol not specified as accepted', () => {
      const baseUrl = 'smtp://fakeurl.com/';
      const linkUrl = 'http://fakeurl.com/';
      const link = linkObj(linkUrl);

      linkObj.resolve(link, baseUrl, options);

      expect(link).to.be.like({
        url: {
          resolved: linkUrl
        },
        base: {
          original: baseUrl,
          resolved: baseUrl
        },
        internal: false,
        samePage: false
      });
    });

    it('accepts an html base with a scheme/protocol not specified as accepted', () => {
      const baseUrl = 'http://fakeurl.com/';
      const htmlBaseUrl = 'smtp://fakeurl.com/';
      const linkUrl = 'http://fakeurl.com/';

      const link = linkObj(linkUrl);
      link.html.base = htmlBaseUrl;

      linkObj.resolve(link, baseUrl, options);

      expect(link).to.be.like({
        url: {
          resolved: linkUrl
        },
        base: {
          original: baseUrl,
          resolved: htmlBaseUrl
        },
        internal: true,
        samePage: true
      });
    });

    it('rejects an absolute url with a scheme/protocol not specified as accepted', () => {
      const baseUrl = 'http://fakeurl.com/';
      const linkUrl = 'smtp://fakeurl.com/';
      const link = linkObj(linkUrl);

      linkObj.resolve(link, baseUrl, options);

      expect(link).to.be.like({
        url: {
          original: linkUrl,
          resolved: null
        },
        internal: false,
        samePage: false
      });
    });

    it('rejects a relative url with a base containing a scheme/protocol not specified as accepted', () => {
      const baseUrl = 'smtp://fakeurl.com/';
      const linkUrl = 'path/resource.html?query#hash';
      const link = linkObj(linkUrl);

      linkObj.resolve(link, baseUrl, options);

      expect(link).to.be.like({
        url: {
          original: linkUrl,
          resolved: null
        },
        base: {
          original: baseUrl,
          resolved: baseUrl
        },
        internal: null,
        samePage: null
      });
    });
  });
});
