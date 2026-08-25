import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { glob } from 'glob';

export type UrlRewriteExpression = {
	pattern: RegExp;
	replacement: string;
};

export type StatusCodeAction = 'ok' | 'warn' | 'skip' | 'error';

export type CheckOptions = {
	concurrency?: number;
	port?: number;
	path: string | string[];
	recurse?: boolean;
	sitemap?: boolean | string | string[];
	timeout?: number;
	markdown?: boolean;
	linksToSkip?: string[] | ((link: string) => Promise<boolean>);
	serverRoot?: string;
	directoryListing?: boolean;
	cleanUrls?: boolean;
	retry?: boolean;
	retryErrors?: boolean;
	retryErrorsCount?: number;
	retryErrorsJitter?: number;
	urlRewriteExpressions?: UrlRewriteExpression[];
	userAgent?: string;
	headers?: Record<string, string>;
	redirects?: 'allow' | 'warn' | 'error';
	requireHttps?: 'off' | 'warn' | 'error';
	allowInsecureCerts?: boolean;
	checkCss?: boolean;
	checkFragments?: boolean;
	fragmentsToSkip?:
		| string[]
		| ((fragment: string, url: string) => Promise<boolean>);
	statusCodes?: Record<string, StatusCodeAction>;
};

export type InternalCheckOptions = {
	syntheticServerRoot?: string;
	staticHttpServerHost?: string;
} & CheckOptions;

export const DEFAULT_USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** @internal */
export async function findCommonPathRoot(
	paths: string[],
	pathImplementation = path,
): Promise<string> {
	const filesystemRoot = pathImplementation.parse(paths[0]).root;
	const normalizedFilesystemRoot = filesystemRoot.toLowerCase();
	if (
		paths.some(
			(filePath) =>
				pathImplementation.parse(filePath).root.toLowerCase() !==
				normalizedFilesystemRoot,
		)
	) {
		throw new Error(
			'Absolute paths must be on the same filesystem when checked together.',
		);
	}

	const servingRoots = await Promise.all(
		paths.map(async (filePath) => {
			const stats = await fs.stat(filePath);
			return stats.isDirectory()
				? filePath
				: pathImplementation.dirname(filePath);
		}),
	);
	let commonRoot = servingRoots[0];
	for (const servingRoot of servingRoots.slice(1)) {
		let relativePath = pathImplementation.relative(commonRoot, servingRoot);
		while (relativePath.split(pathImplementation.sep)[0] === '..') {
			commonRoot = pathImplementation.dirname(commonRoot);
			relativePath = pathImplementation.relative(commonRoot, servingRoot);
		}
	}

	return commonRoot;
}

/**
 * Validate the provided flags all work with each other.
 * @param options CheckOptions passed in from the CLI (or API)
 */
export async function processOptions(
	options_: CheckOptions,
): Promise<InternalCheckOptions> {
	const options: InternalCheckOptions = { ...options_ };
	// Ensure at least one path is provided
	if (options.path.length === 0) {
		throw new Error('At least one path must be provided');
	}

	// Normalize options.path to an array of strings
	if (!Array.isArray(options.path)) {
		options.path = [options.path];
	}

	// Disable directory listings by default
	if (options.directoryListing === undefined) {
		options.directoryListing = false;
	}

	// Default redirects to 'allow'
	options.redirects = options.redirects ?? 'allow';

	// Ensure we do not mix http:// and file system paths.  The paths passed in
	// must all be filesystem paths, or HTTP paths.
	let isUrlType: boolean | undefined;
	for (const path of options.path) {
		const innerIsUrlType = path.startsWith('http');
		if (isUrlType === undefined) {
			isUrlType = innerIsUrlType;
		} else if (innerIsUrlType !== isUrlType) {
			throw new Error(
				'Paths cannot be mixed between HTTP and local filesystem paths.',
			);
		}
	}

	// If there is a server root, make sure there are no HTTP paths
	if (options.serverRoot && isUrlType) {
		throw new Error(
			"'serverRoot' cannot be defined when the 'path' points to an HTTP endpoint.",
		);
	}

	if (options.sitemap && !isUrlType) {
		throw new Error("'sitemap' can only be used with HTTP paths.");
	}

	const headers = options.headers ?? {};
	if (
		Object.keys(headers).some((name) => name.toLowerCase() === 'user-agent')
	) {
		options.headers = Object.fromEntries(
			Object.entries(headers).map(([name, value]) => [
				name.toLowerCase() === 'user-agent' ? 'User-Agent' : name,
				value,
			]),
		);
	} else if (options.userAgent) {
		// Only set User-Agent if explicitly provided by user. Using Node.js's
		// default "node" User-Agent works better with modern sites that have bot
		// detection (they may redirect browser UAs into auth loops).
		options.headers = {
			'User-Agent': options.userAgent,
			...headers,
		};
	} else {
		options.headers = headers;
	}
	options.serverRoot &&= path.normalize(options.serverRoot);

	// Default to 'allow' for redirect handling
	options.redirects = options.redirects ?? 'allow';

	// Default to 'off' for HTTPS requirement
	options.requireHttps = options.requireHttps ?? 'off';

	// Expand globs into paths
	if (!isUrlType) {
		const paths: string[] = [];
		for (const filePath of options.path) {
			// The glob path provided is relative to the serverRoot. For example,
			// if the serverRoot is test/fixtures/nested, and the glob is "*/*.html",
			// The glob needs to be calculated from the serverRoot directory.
			let fullPath = options.serverRoot
				? path.join(options.serverRoot, filePath)
				: filePath;

			// Node-glob only accepts unix style path separators as of 8.x
			fullPath = fullPath.split(path.sep).join('/');
			const expandedPaths = await glob(fullPath);
			if (expandedPaths.length === 0) {
				throw new Error(
					`The provided glob "${filePath}" returned 0 results. The current working directory is "${process.cwd()}".`,
				);
			}

			// After resolving the globs, the paths need to be returned to their
			// original form, without the serverRoot included in the path.
			for (let p of expandedPaths) {
				p = path.normalize(p);
				if (options.serverRoot) {
					const contractedPath = p
						.split(path.sep)
						.filter(Boolean)
						.slice(options.serverRoot.split(path.sep).filter(Boolean).length)
						.join(path.sep);
					paths.push(contractedPath);
				} else {
					paths.push(p);
				}
			}
		}

		options.path = paths;
	}

	// Enable markdown if someone passes a flag/glob right at it
	if (options.markdown === undefined) {
		for (const p of options.path) {
			const extension = path.extname(p).toLowerCase();
			if (extension === '.md' || extension === '.mdx') {
				options.markdown = true;
			}
		}
	}

	// Figure out which directory should be used as the root for the web server,
	// and how that impacts the path to the file for the first request.
	if (!options.serverRoot && !isUrlType) {
		// If any path is absolute, normalize every path and serve them relative to
		// their nearest common directory. This keeps the local server from
		// incorrectly looking for absolute paths beneath process.cwd().
		if (options.path.length > 1) {
			if (options.path.some((filePath) => path.isAbsolute(filePath))) {
				const absolutePaths = options.path.map((filePath) =>
					path.resolve(filePath),
				);
				const serverRoot = await findCommonPathRoot(absolutePaths);
				options.serverRoot = serverRoot;
				options.path = absolutePaths.map((filePath) =>
					path.relative(serverRoot, filePath),
				);
				options.syntheticServerRoot = options.serverRoot;
			} else {
				options.serverRoot = process.cwd();
			}
		} else {
			// If there's a single path, try to be smart and figure it out
			const s = await fs.stat(options.path[0]);
			options.serverRoot = options.path[0];
			if (s.isFile()) {
				const pathParts = options.path[0].split(path.sep);
				options.path = [path.join('.', pathParts.at(-1) ?? '')];
				options.serverRoot = pathParts.slice(0, -1).join(path.sep) || '.';
			} else {
				options.serverRoot = options.path[0];
				options.path = '/';
			}

			options.syntheticServerRoot = options.serverRoot;
		}
	}

	return options;
}
