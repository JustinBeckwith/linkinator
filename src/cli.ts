#!/usr/bin/env node

import process from 'node:process';
import chalk from 'chalk';
import meow from 'meow';
import packageJson from '../package.json' with { type: 'json' };
import { type Flags, getConfig } from './config.js';
import {
	type CheckOptions,
	LinkChecker,
	type LinkResult,
	LinkState,
	type RedirectInfo,
	type RetryInfo,
} from './index.js';
import { Format, Logger, LogLevel } from './logger.js';

const cli = meow(
	`
	Usage
		$ linkinator LOCATION [ --arguments ]

	Positional arguments

		LOCATION
			Required. Either the URLs or the paths on disk to check for broken links.

	Flags

		--concurrency
			The number of connections to make simultaneously. Defaults to 100.

		--config
			Path to the config file to use. Looks for \`linkinator.config.json\` by default.

		--directory-listing
			Include an automatic directory index file when linking to a directory.
			Defaults to 'false'.

		--clean-urls
			Enable clean URLs (extensionless links). When enabled, links like '/about'
			will automatically resolve to '/about.html' if the file exists.
			Mimics behavior of modern static hosting platforms like Vercel.
			Defaults to 'false'.

		--format, -f
			Return the data in CSV or JSON format.

		--header, -h
			List of additional headers to be include in the request. use key:value notation.

		--help
			Show this command.

		--version
			Show the version number.

		--markdown
			Automatically parse and scan markdown if scanning from a location on disk.

		--recurse, -r
			Recursively follow links on the same root domain.

		--check-css
			Extract and check URLs found in CSS properties (inline styles, <style> tags, and external CSS files).
			This includes url() functions, @import statements, and other CSS URL references.
			Defaults to false.

		--check-fragments
			Validate fragment identifiers (URL anchors like #section-name) exist on the target HTML page.
			Invalid fragments will be marked as broken. Only checks server-rendered HTML (not JavaScript-added fragments).
			Defaults to false.

		--redirects
			Control how redirects are handled. Options are 'allow' (default, follows redirects),
			'warn' (follows but emits warnings), or 'error' (treats redirects as broken).

		--require-https
			Enforce HTTPS links. Options are 'off' (default, accepts both HTTP and HTTPS),
			'warn' (accepts both but emits warnings for HTTP), or 'error' (treats HTTP links as broken).

		--allow-insecure-certs
			Allow invalid or self-signed SSL certificates. Useful for local development with
			untrusted certificates. Defaults to false.

		--retry,
			Automatically retry requests that return HTTP 429 responses and include
			a 'retry-after' header. Defaults to false.

		--retry-errors,
			Automatically retry requests that return 5xx or unknown response.

		--retry-errors-count,
			How many times should an error be retried?

		--retry-errors-jitter,
			Random jitter applied to error retry.

		--server-root
			When scanning a locally directory, customize the location on disk
			where the server is started.  Defaults to the path passed in [LOCATION].

		--skip, -s
			List of urls in regexy form to not include in the check.
			Can be specified multiple times.

		--status-code
			Control how specific HTTP status codes are handled. Format: "CODE:ACTION"
			where CODE is a numeric status code (e.g., 403) or pattern (e.g., 4xx, 5xx)
			and ACTION is one of: ok (success), warn (success with warning),
			skip (ignore link), or error (force failure).
			Can be specified multiple times. Example: --status-code "403:warn"

		--timeout
			Request timeout in ms.  Defaults to 0 (no timeout).

		--url-rewrite-search
			Pattern to search for in urls.  Must be used with --url-rewrite-replace.

		--url-rewrite-replace
			Expression used to replace search content.  Must be used with --url-rewrite-search.

		--user-agent
			The user agent passed in all HTTP requests. Defaults to 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.117 Safari/537.36'

		--verbosity
			Override the default verbosity for this command. Available options are
			'debug', 'info', 'warning', 'error', and 'none'.  Defaults to 'warning'.

	Examples
		$ linkinator docs/
		$ linkinator https://www.google.com
		$ linkinator . --recurse
		$ linkinator . --skip www.googleapis.com
		$ linkinator . --skip example.com --skip github.com
		$ linkinator . --format CSV
		$ linkinator https://example.com --recurse --check-fragments --redirects error --require-https error --check-css
`,
	{
		importMeta: import.meta,
		version: packageJson.version,
		flags: {
			config: { type: 'string' },
			concurrency: { type: 'number' },
			recurse: { type: 'boolean', shortFlag: 'r' },
			skip: { type: 'string', shortFlag: 's', isMultiple: true },
			statusCode: { type: 'string', isMultiple: true },
			format: { type: 'string', shortFlag: 'f' },
			silent: { type: 'boolean' },
			timeout: { type: 'number' },
			markdown: { type: 'boolean' },
			checkCss: { type: 'boolean' },
			checkFragments: { type: 'boolean' },
			serverRoot: { type: 'string' },
			verbosity: { type: 'string' },
			directoryListing: { type: 'boolean' },
			cleanUrls: { type: 'boolean' },
			redirects: { type: 'string', choices: ['allow', 'warn', 'error'] },
			requireHttps: { type: 'string', choices: ['off', 'warn', 'error'] },
			allowInsecureCerts: { type: 'boolean' },
			retry: { type: 'boolean' },
			retryErrors: { type: 'boolean' },
			retryErrorsCount: { type: 'number', default: 5 },
			retryErrorsJitter: { type: 'number', default: 3000 },
			urlRewriteSearch: { type: 'string' },
			urlReWriteReplace: { type: 'string' },
			header: { type: 'string', shortFlag: 'h', isMultiple: true },
		},
		booleanDefault: undefined,
	},
);

let flags: Flags;

function isBunExecutable() {
	// When compiled with `bun build --compile`, process.argv[0] is typically "bun".
	// When run directly with `bun`, process.argv[0] is the path to the bun executable.
	// This check assumes that the compiled executable itself is not named "bun".
	return process.argv[0] === 'bun';
}

async function main() {
	if (cli.input.length === 0) {
		cli.showHelp();
		return;
	}

	// Type assertion needed because meow's type for cli.flags uses generic string
	// but meow validates the 'choices' at runtime to ensure it's one of the valid values
	flags = await getConfig(cli.flags as Flags);
	if (
		(flags.urlRewriteReplace && !flags.urlRewriteSearch) ||
		(flags.urlRewriteSearch && !flags.urlRewriteReplace)
	) {
		throw new Error(
			'The url-rewrite-replace flag must be used with the url-rewrite-search flag.',
		);
	}

	// This is a workaround for a bug in bun where the `dispatcher` option in
	// `fetch` is not respected. This causes the `allowInsecureCerts` option to
	// be ignored. By setting the `NODE_TLS_REJECT_UNAUTHORIZED` environment
	// variable to '0', we can bypass certificate validation for all requests.
	if (flags.allowInsecureCerts && isBunExecutable()) {
		console.warn(
			'Info: Certificate validation is being bypassed for this run due to --allow-insecure-certs flag in a bun executable environment. This is a workaround for a known bun issue.',
		);
		process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
	}

	const start = Date.now();
	const verbosity = parseVerbosity(flags);
	const format = parseFormat(flags);
	const logger = new Logger(verbosity, format);
	const header = flags.header ?? [];
	const headers = Object.fromEntries(
		header.map((item) => {
			const colonIndex = item.indexOf(':');
			if (colonIndex === -1) {
				throw new Error(
					`Invalid header format: "${item}". Use "Header-Name:value" format.`,
				);
			}
			const key = item.slice(0, colonIndex).trim();
			const value = item.slice(colonIndex + 1).trim();
			if (!key) {
				throw new Error(
					`Invalid header format: "${item}". Header name cannot be empty.`,
				);
			}
			if (value === undefined || value === '') {
				throw new Error(
					`Invalid header format: "${item}". Header value cannot be empty.`,
				);
			}
			return [key, value];
		}),
	);

	logger.error(`→ crawling ${cli.input.join(' ')}`);

	const checker = new LinkChecker();
	if (format === Format.CSV) {
		const header = 'url,status,state,parent,failureDetails';
		console.log(header);
	}

	checker.on('retry', (info: RetryInfo) => {
		logger.warn(`Retrying: ${info.url} in ${info.secondsUntilRetry} seconds.`);
	});
	checker.on('redirect', (info: RedirectInfo) => {
		const nonStandardNote = info.isNonStandard ? ' (non-standard)' : '';
		const target = info.targetUrl ? ` → ${info.targetUrl}` : '';
		logger.warn(
			`${chalk.yellow('[REDIRECT]')} ${chalk.gray(info.url)}${target} ${chalk.dim(`(${info.status}${nonStandardNote})`)}`,
		);
	});
	checker.on('statusCodeWarning', (info: { url: string; status: number }) => {
		logger.warn(
			`${chalk.yellow('[WARN]')} ${chalk.gray(info.url)} ${chalk.dim(`(${info.status})`)}`,
		);
	});
	checker.on('link', (link: LinkResult) => {
		let state = '';
		const isFragmentFailure = link.failureDetails?.some(
			(detail) =>
				detail instanceof Error &&
				detail.message.includes('Fragment identifier'),
		);

		switch (link.state) {
			case LinkState.BROKEN: {
				if (isFragmentFailure) {
					state = `[${chalk.red('#')}]`;
					// Highlight the fragment portion with red text
					const hashIndex = link.url.indexOf('#');
					if (hashIndex !== -1) {
						const baseUrl = link.url.substring(0, hashIndex);
						const fragment = link.url.substring(hashIndex);
						logger.error(
							`${state} ${chalk.gray(baseUrl)}${chalk.red(fragment)}`,
						);
					} else {
						logger.error(`${state} ${chalk.gray(link.url)}`);
					}
				} else {
					state = `[${chalk.red(link.status?.toString())}]`;
					logger.error(`${state} ${chalk.gray(link.url)}`);
				}
				break;
			}

			case LinkState.OK: {
				state = `[${chalk.green(link.status?.toString())}]`;
				logger.warn(`${state} ${chalk.gray(link.url)}`);
				break;
			}

			case LinkState.SKIPPED: {
				if (link.status === 999 || link.status === 403) {
					state = `[${chalk.grey(link.status.toString())}]`;
					logger.info(
						`${state} ${chalk.gray(link.url)} ${chalk.dim('(bot-protected)')}`,
					);
				} else {
					state = `[${chalk.grey('SKP')}]`;
					logger.info(`${state} ${chalk.gray(link.url)}`);
				}
				break;
			}
		}

		if (format === Format.CSV) {
			const showIt = shouldShowResult(link, verbosity);
			if (showIt) {
				const failureDetails = link.failureDetails
					? JSON.stringify(link.failureDetails, null, 2)
					: '';
				// Helper function to escape CSV fields only when needed
				const escapeCsvField = (field: string): string => {
					if (!field) return '';
					// Quote if field contains comma, quote, or newline
					if (
						field.includes(',') ||
						field.includes('"') ||
						field.includes('\n')
					) {
						return `"${field.replace(/"/g, '""')}"`;
					}
					return field;
				};
				console.log(
					`${escapeCsvField(link.url)},${link.status},${link.state},${escapeCsvField(link.parent || '')},${escapeCsvField(failureDetails)}`,
				);
			}
		}
	});
	const options: CheckOptions = {
		path: cli.input,
		recurse: flags.recurse,
		timeout: Number(flags.timeout),
		markdown: flags.markdown,
		checkCss: flags.checkCss,
		checkFragments: flags.checkFragments,
		concurrency: Number(flags.concurrency),
		serverRoot: flags.serverRoot,
		directoryListing: flags.directoryListing,
		cleanUrls: flags.cleanUrls,
		redirects: flags.redirects,
		requireHttps: flags.requireHttps,
		allowInsecureCerts: flags.allowInsecureCerts,
		retry: flags.retry,
		retryErrors: flags.retryErrors,
		retryErrorsCount: Number(flags.retryErrorsCount),
		retryErrorsJitter: Number(flags.retryErrorsJitter),
		headers,
	};
	if (flags.skip) {
		if (typeof flags.skip === 'string') {
			options.linksToSkip = flags.skip.split(/[\s,]+/).filter(Boolean);
		} else if (Array.isArray(flags.skip)) {
			// With `isMultiple` enabled in meow, a comma delimeted list will still
			// be passed as an array, but with a single element that still needs to
			// be split.
			options.linksToSkip = [];
			for (const skip of flags.skip) {
				const rules = skip.split(/[\s,]+/).filter(Boolean);
				options.linksToSkip.push(...rules);
			}
		}
	}

	if (flags.urlRewriteSearch && flags.urlRewriteReplace) {
		options.urlRewriteExpressions = [
			{
				pattern: new RegExp(flags.urlRewriteSearch),
				replacement: flags.urlRewriteReplace,
			},
		];
	}

	// Merge statusCodes from config file and CLI flags
	// Start with config file statusCodes if present
	if (flags.statusCodes) {
		options.statusCodes = { ...flags.statusCodes } as Record<
			string,
			'ok' | 'warn' | 'skip' | 'error'
		>;
	}

	// Parse and add CLI statusCode flags (these override config file)
	if (flags.statusCode) {
		options.statusCodes = options.statusCodes || {};
		const statusCodes = Array.isArray(flags.statusCode)
			? flags.statusCode
			: [flags.statusCode];
		for (const item of statusCodes) {
			const colonIndex = item.indexOf(':');
			if (colonIndex === -1) {
				throw new Error(
					`Invalid status-code format: "${item}". Use "CODE:ACTION" format (e.g., "403:warn").`,
				);
			}
			const code = item.slice(0, colonIndex).trim();
			const action = item.slice(colonIndex + 1).trim();
			if (!code) {
				throw new Error(
					`Invalid status-code format: "${item}". Status code cannot be empty.`,
				);
			}
			if (!['ok', 'warn', 'skip', 'error'].includes(action)) {
				throw new Error(
					`Invalid status-code action: "${action}". Must be one of: ok, warn, skip, error.`,
				);
			}
			options.statusCodes[code] = action as 'ok' | 'warn' | 'skip' | 'error';
		}
	}

	const result = await checker.check(options);
	const filteredResults = result.links.filter((link) =>
		shouldShowResult(link, verbosity),
	);
	if (format === Format.JSON) {
		result.links = filteredResults;
		console.log(JSON.stringify(result, null, 2));
		gracefulExit(result.passed ? 0 : 1);
		return;
	}

	if (format === Format.CSV) {
		gracefulExit(result.passed ? 0 : 1);
		return;
	}

	// Build a collection scanned links, collated by the parent link used in
	// the scan.  For example:
	// {
	//   "./README.md": [
	//     {
	//       url: "https://img.shields.io/npm/v/linkinator.svg",
	//       status: 200
	//       ....
	//     }
	//   ],
	// }
	const parents = result.links.reduce<Record<string, LinkResult[]>>(
		(accumulator, current) => {
			const parent = current.parent || '';
			accumulator[parent] ||= [];

			accumulator[parent].push(current);
			return accumulator;
		},
		{},
	);

	for (const parent of Object.keys(parents)) {
		// Prune links based on verbosity
		const links = parents[parent].filter((link) => {
			if (verbosity === LogLevel.NONE) {
				return false;
			}

			if (link.state === LinkState.BROKEN) {
				return true;
			}

			if (link.state === LinkState.OK && verbosity <= LogLevel.WARNING) {
				return true;
			}

			if (link.state === LinkState.SKIPPED && verbosity <= LogLevel.INFO) {
				return true;
			}

			return false;
		});
		if (links.length === 0) {
			continue;
		}

		logger.error(chalk.blue(parent));
		for (const link of links) {
			let state = '';
			// Check if this is a fragment failure by looking at failureDetails OR checking if URL has fragment with 2xx status
			const isFragmentFailure =
				link.failureDetails?.some(
					(detail) =>
						detail instanceof Error &&
						detail.message.includes('Fragment identifier'),
				) ||
				(link.state === LinkState.BROKEN &&
					link.status &&
					link.status >= 200 &&
					link.status < 300 &&
					link.url.includes('#'));

			switch (link.state) {
				case LinkState.BROKEN: {
					if (isFragmentFailure) {
						state = `[${chalk.red('#')}]`;
						// Highlight the fragment portion with red text
						const hashIndex = link.url.indexOf('#');
						if (hashIndex !== -1) {
							const baseUrl = link.url.substring(0, hashIndex);
							const fragment = link.url.substring(hashIndex);
							logger.error(
								`  ${state} ${chalk.gray(baseUrl)}${chalk.red(fragment)}`,
							);
						} else {
							logger.error(`  ${state} ${chalk.gray(link.url)}`);
						}
					} else {
						state = `[${chalk.red(link.status?.toString())}]`;
						logger.error(`  ${state} ${chalk.gray(link.url)}`);
					}
					logger.debug(JSON.stringify(link.failureDetails, null, 2));
					break;
				}

				case LinkState.OK: {
					state = `[${chalk.green(link.status?.toString())}]`;
					logger.warn(`  ${state} ${chalk.gray(link.url)}`);
					break;
				}

				case LinkState.SKIPPED: {
					if (link.status === 999 || link.status === 403) {
						state = `[${chalk.grey(link.status.toString())}]`;
						logger.info(
							`  ${state} ${chalk.gray(link.url)} ${chalk.dim('(bot-protected)')}`,
						);
					} else {
						state = `[${chalk.grey('SKP')}]`;
						logger.info(`  ${state} ${chalk.gray(link.url)}`);
					}
					break;
				}
			}
		}
	}

	const total = (Date.now() - start) / 1000;
	const scannedLinks = result.links.filter(
		(x) => x.state !== LinkState.SKIPPED,
	);
	if (!result.passed) {
		const borked = result.links.filter((x) => x.state === LinkState.BROKEN);
		logger.error(
			chalk.bold(
				`${chalk.red('ERROR')}: Detected ${
					borked.length
				} broken links. Scanned ${chalk.yellow(
					scannedLinks.length.toString(),
				)} links in ${chalk.cyan(total.toString())} seconds.`,
			),
		);
		gracefulExit(1);
		return;
	}

	logger.error(
		chalk.bold(
			`✓ Successfully scanned ${chalk.green(
				scannedLinks.length.toString(),
			)} links in ${chalk.cyan(total.toString())} seconds.`,
		),
	);
	gracefulExit(0);
}

/**
 * Exit the process gracefully with a timeout fallback.
 * This allows Node.js a brief moment to clean up resources (like closing
 * connection pools) but forces exit after 100ms to prevent hanging.
 */
function gracefulExit(code: number): void {
	process.exitCode = code;
	// Schedule a forced exit after 100ms in case resources don't clean up
	const exitTimer = setTimeout(() => {
		process.exit(code);
	}, 100);
	// If the process exits naturally before the timeout, clear the timer
	exitTimer.unref();
}

function parseVerbosity(flags: Flags): LogLevel {
	if (flags.silent && flags.verbosity) {
		throw new Error(
			'The SILENT and VERBOSITY flags cannot both be defined. Please consider using VERBOSITY only.',
		);
	}

	if (flags.silent) {
		return LogLevel.ERROR;
	}

	if (!flags.verbosity) {
		return LogLevel.WARNING;
	}

	const verbosity = flags.verbosity.toUpperCase();
	const options = Object.values(LogLevel);
	if (!options.includes(verbosity)) {
		throw new Error(
			`Invalid flag: VERBOSITY must be one of [${options.join(',')}]`,
		);
	}

	return LogLevel[verbosity as keyof typeof LogLevel];
}

function parseFormat(flags: Flags): Format {
	if (!flags.format) {
		return Format.TEXT;
	}

	flags.format = flags.format.toUpperCase();
	const options = Object.values(Format);
	if (!options.includes(flags.format)) {
		throw new Error("Invalid flag: FORMAT must be 'TEXT', 'JSON', or 'CSV'.");
	}

	return Format[flags.format as keyof typeof Format];
}

function shouldShowResult(link: LinkResult, verbosity: LogLevel) {
	switch (link.state) {
		case LinkState.OK: {
			return verbosity <= LogLevel.WARNING;
		}

		case LinkState.BROKEN: {
			if (verbosity > LogLevel.DEBUG) {
				link.failureDetails = undefined;
			}

			return verbosity <= LogLevel.ERROR;
		}

		case LinkState.SKIPPED: {
			return verbosity <= LogLevel.INFO;
		}
	}
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	gracefulExit(1);
}
