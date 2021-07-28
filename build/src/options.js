"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.processOptions = void 0;
const fs = require("fs");
const util = require("util");
const path = require("path");
const globby = require("glob");
const stat = util.promisify(fs.stat);
const glob = util.promisify(globby);
/**
 * Validate the provided flags all work with each other.
 * @param options CheckOptions passed in from the CLI (or API)
 */
async function processOptions(opts) {
    const options = Object.assign({}, opts);
    // ensure at least one path is provided
    if (options.path.length === 0) {
        throw new Error('At least one path must be provided');
    }
    // normalize options.path to an array of strings
    if (!Array.isArray(options.path)) {
        options.path = [options.path];
    }
    // disable directory listings by default
    if (options.directoryListing === undefined) {
        options.directoryListing = false;
    }
    // Ensure we do not mix http:// and file system paths.  The paths passed in
    // must all be filesystem paths, or HTTP paths.
    let isUrlType = undefined;
    for (const path of options.path) {
        const innerIsUrlType = path.startsWith('http');
        if (isUrlType === undefined) {
            isUrlType = innerIsUrlType;
        }
        else if (innerIsUrlType !== isUrlType) {
            throw new Error('Paths cannot be mixed between HTTP and local filesystem paths.');
        }
    }
    // if there is a server root, make sure there are no HTTP paths
    if (options.serverRoot && isUrlType) {
        throw new Error("'serverRoot' cannot be defined when the 'path' points to an HTTP endpoint.");
    }
    if (options.serverRoot) {
        options.serverRoot = path.normalize(options.serverRoot);
    }
    // expand globs into paths
    if (!isUrlType) {
        const paths = [];
        for (const filePath of options.path) {
            // The glob path provided is relative to the serverRoot. For example,
            // if the serverRoot is test/fixtures/nested, and the glob is "*/*.html",
            // The glob needs to be calculated from the serverRoot directory.
            const fullPath = options.serverRoot
                ? path.join(options.serverRoot, filePath)
                : filePath;
            const expandedPaths = await glob(fullPath);
            if (expandedPaths.length === 0) {
                throw new Error(`The provided glob "${filePath}" returned 0 results. The current working directory is "${process.cwd()}".`);
            }
            // After resolving the globs, the paths need to be returned to their
            // original form, without the serverRoot included in the path.
            for (let p of expandedPaths) {
                p = path.normalize(p);
                if (options.serverRoot) {
                    const contractedPath = p
                        .split(path.sep)
                        .slice(options.serverRoot.split(path.sep).length)
                        .join(path.sep);
                    paths.push(contractedPath);
                }
                else {
                    paths.push(p);
                }
            }
        }
        options.path = paths;
    }
    // enable markdown if someone passes a flag/glob right at it
    if (options.markdown === undefined) {
        for (const p of options.path) {
            if (path.extname(p).toLowerCase() === '.md') {
                options.markdown = true;
            }
        }
    }
    // Figure out which directory should be used as the root for the web server,
    // and how that impacts the path to the file for the first request.
    if (!options.serverRoot && !isUrlType) {
        // if the serverRoot wasn't defined, and there are multiple paths, just
        // use process.cwd().
        if (options.path.length > 1) {
            options.serverRoot = process.cwd();
        }
        else {
            // if there's a single path, try to be smart and figure it out
            const s = await stat(options.path[0]);
            options.serverRoot = options.path[0];
            if (s.isFile()) {
                const pathParts = options.path[0].split(path.sep);
                options.path = [path.join('.', pathParts[pathParts.length - 1])];
                options.serverRoot =
                    pathParts.slice(0, pathParts.length - 1).join(path.sep) || '.';
            }
            else {
                options.serverRoot = options.path[0];
                options.path = '/';
            }
            options.syntheticServerRoot = options.serverRoot;
        }
    }
    return options;
}
exports.processOptions = processOptions;
//# sourceMappingURL=options.js.map