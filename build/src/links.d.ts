import { Readable } from 'node:stream';
export type ParsedUrl = {
    link: string;
    error?: Error;
    url?: URL;
    fragment?: string;
};
export declare function getLinks(source: Readable, baseUrl: string, checkCss?: boolean): Promise<ParsedUrl[]>;
/**
 * Extracts URLs from CSS content.
 * Finds URLs in:
 * - @import rules: @import url(...) or @import "..."
 * - url() functions in property values: background: url(...)
 * @param source Readable stream of CSS content
 * @param baseUrl Base URL for resolving relative URLs
 * @returns Array of parsed URLs found in the CSS
 */
export declare function getCssLinks(source: Readable, baseUrl: string): Promise<ParsedUrl[]>;
/**
 * Extracts all valid fragment identifiers from HTML.
 * Valid fragment targets include:
 * - Elements with id attribute: <div id="section">
 * - Named anchors: <a name="section">
 * @param source Readable stream of HTML content
 * @returns Set of valid fragment identifiers
 */
export declare function extractFragmentIds(source: Readable): Promise<Set<string>>;
export type FragmentValidationResult = {
    fragment: string;
    isValid: boolean;
};
/**
 * Validates fragment identifiers against HTML content.
 * @param htmlContent The HTML content as a Buffer
 * @param fragmentsToValidate Set of fragment identifiers to validate
 * @returns Array of validation results for each fragment
 */
export declare function validateFragments(htmlContent: Buffer, fragmentsToValidate: Set<string>): Promise<FragmentValidationResult[]>;
