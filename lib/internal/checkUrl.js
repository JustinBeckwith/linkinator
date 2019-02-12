"use strict";
const linkObj = require("./linkObj");
const reasons = require("./messages").reasons;
const simpleResponse = require("./simpleResponse");

const bhttp = require("bhttp");
const extend = require("extend");
const isString = require("is-string");

/*
	Checks a URL to see if it's broken or not.
*/
function checkUrl(link, baseUrl, cache, options, retry) {
  let cached;

  if (retry === undefined) {
    if (isString(link) === true) {
      link = linkObj(link);
      linkObj.resolve(link, baseUrl, options);
    }

    if (link.url.resolved === null) {
      link.broken = true;
      link.brokenReason = "BLC_INVALID";
      linkObj.clean(link);
      return Promise.resolve(link);
    }

    cached = cache.get(link.url.parsed);

    if (cached !== undefined) {
      return Promise.resolve(cached).then(response => {
        // Cloned to avoid unexpected mutations as a result of user changes
        response = extend({}, response);

        copyResponseData(response, link, options);

        link.http.cached = true;

        return link;
      });
    }
  }

  const request = bhttp
    .request(link.url.resolved, {
      discardResponse: true,
      headers: { "user-agent": options.userAgent },
      method: retry !== 405 ? options.requestMethod : "get"
    })
    .then(response => {
      response = simpleResponse(response);

      if (
        response.statusCode === 405 &&
        options.requestMethod === "head" &&
        options.retry405Head === true &&
        retry !== 405
      ) {
        // Retry possibly broken server with "get"
        return checkUrl(link, baseUrl, cache, options, 405);
      }

      if (
        options.cacheResponses === true &&
        response.url !== link.url.resolved
      ) {
        cache.set(response.url, response);
      }

      return response;
    })
    .catch(error => {
      // The error will be stored as a response
      return error;
    });

  if (retry === undefined) {
    // Send response to cache -- it will be available to `cache.get()` before being resolved
    if (options.cacheResponses === true) {
      cache.set(link.url.parsed, request);
    }

    // Send linkObj to caller
    return request.then(response => {
      copyResponseData(response, link, options);

      link.http.cached = false;

      return link;
    });
  } else {
    return request;
  }
}

/*
	Copy data from a bhttp response object—either from a request or cache—
	into a link object.
*/
function copyResponseData(response, link) {
  if (response instanceof Error === false) {
    if (response.statusCode !== 200) {
      link.broken = true;
      link.brokenReason = "HTTP_" + response.statusCode;
    } else {
      link.broken = false;
    }
    link.http.response = response;
    if (link.url.resolved !== response.url) {
      link.url.redirected = response.url;
      if (link.base.resolved !== null) {
        linkObj.relation(link, link.url.redirected);
      }
    }
  } else {
    link.broken = true;

    if (reasons["ERRNO_" + response.code] !== null) {
      link.brokenReason = "ERRNO_" + response.code;
    } else {
      /*else if (response.message === "Invalid URL")
		{
			link.brokenReason = "BLC_INVALID";
		}*/
      link.brokenReason = "BLC_UNKNOWN";
    }
  }

  linkObj.clean(link);
}

module.exports = checkUrl;
