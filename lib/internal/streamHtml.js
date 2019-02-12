'use strict';
const errors = require('./messages').errors;
const simpleResponse = require('./simpleResponse');

const bhttp = require('bhttp');

function checkErrors(response) {
  let error;

  if (response.statusCode !== 200) {
    error = new Error(errors.HTML_RETRIEVAL);
    error.code = response.statusCode;
    return error;
  }

  const type = response.headers['content-type'];

  // content-type is not mandatory in HTTP spec
  if (!type || type.indexOf('text/html') !== 0) {
    error = new Error(errors.EXPECTED_HTML(type));
    error.code = response.statusCode;
    return error;
  }
}

/*
	Request a URL for its HTML contents and return a stream.
*/
function streamHtml(url, cache, options) {
  let result;

  // Always gets the URL because response bodies are never cached
  const request = bhttp
    .get(url, {
      headers: { 'user-agent': options.userAgent },
      stream: true
    })
    .then(orgResponse => {
      const response = simpleResponse(orgResponse);

      result = checkErrors(response);

      if (result === undefined) {
        result = {
          response: response,
          stream: orgResponse
        };

        // Send response of redirected url to cache
        if (options.cacheResponses === true && response.url !== url) {
          // Will always overwrite previous value
          cache.set(response.url, response);
        }
      }

      return response;
    })
    .catch(error => {
      // The error will be stored as a response
      return error;
    });

  // Send response to cache -- it will be available to `cache.get()` before being resolved
  if (options.cacheResponses === true) {
    // Will always overwrite previous value
    cache.set(url, request);
  }

  // Send result to caller
  return request.then(response => {
    if (response instanceof Error === true) throw response;
    if (result instanceof Error === true) throw result;

    return result;
  });
}

module.exports = streamHtml;
