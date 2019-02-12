"use strict";
const tags = require("../../lib/internal/tags");

function tagsString(filterLevel, url) {
  let attrName, tag, tagName;
  const filteredTags = tags[filterLevel];
  let html = "";

  for (tagName in filteredTags) {
    html += "<" + tagName;

    tag = filteredTags[tagName];

    for (attrName in tag) {
      // Special case for `<meta http-equiv="refresh" content="5; url=redirect.html">`
      if (tagName === "meta" && attrName === "content") {
        html += ' http-equiv="refresh" content="5; url=';
      } else {
        html += " " + attrName + '="';
      }

      html += url + '"';
    }

    html += ">link</" + tagName + ">";
  }

  return html;
}

module.exports = tagsString;
