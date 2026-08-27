// @ts-nocheck
// A CommonJS bridge keeps saxes' complete class prototype in Bun standalone
// binaries. A direct ESM named import is over-aggressively tree-shaken by Bun.
const saxes = require('saxes');

/**
 * @typedef {{local: string}} SaxesTag
 * @typedef {{
 *   on(event: 'cdata' | 'text', handler: (text: string) => void): void;
 *   on(event: 'closetag' | 'opentag', handler: (tag: SaxesTag) => void): void;
 *   on(event: 'error', handler: (error: Error) => void): void;
 *   write(chunk: string): SaxesParserInstance;
 *   close(): SaxesParserInstance;
 * }} SaxesParserInstance
 * @typedef {new (options: {xmlns: true}) => SaxesParserInstance} SaxesParserConstructor
 */

/** @type {SaxesParserConstructor} */
exports.SaxesParser = saxes.SaxesParser;
