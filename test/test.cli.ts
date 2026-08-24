import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import util from 'node:util';
import { execa } from 'execa';
import stripAnsi from 'strip-ansi';
import { afterEach, assert, describe, it } from 'vitest';
import { type LinkResult, LinkState } from '../src/index.js';

describe('cli', () => {
	let server: http.Server;

	const package_ = JSON.parse(
		fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
	) as { bin: { linkinator: string } };
	const { linkinator } = package_.bin;
	const node = 'node';

	afterEach(async () => {
		if (server) {
			const close = util.promisify(server.close.bind(server))();
			server.closeAllConnections();
			await close;
			server = undefined as unknown as http.Server;
		}
	});

	it('should show output for failures', async () => {
		const response = await execa(node, [linkinator, 'test/fixtures/basic'], {
			reject: false,
		});
		assert.match(stripAnsi(response.stderr), /ERROR: Detected 1 broken links/);
	});

	it('should pass successful markdown scan', async () => {
		const response = await execa(node, [
			linkinator,
			'test/fixtures/markdown/README.md',
		]);
		assert.match(response.stderr, /Successfully scanned/);
	});

	it('should pass successful mdx scan', async () => {
		const response = await execa(node, [
			linkinator,
			'test/fixtures/mdx-repo/README.mdx',
		]);
		assert.match(response.stderr, /Successfully scanned/);
	});

	it('should allow multiple paths', async () => {
		const response = await execa(node, [
			linkinator,
			'test/fixtures/markdown/unlinked.md',
			'test/fixtures/markdown/README.md',
		]);
		assert.match(response.stderr, /Successfully scanned/);
	});

	it('should allow multiple absolute paths', async () => {
		const response = await execa(node, [
			linkinator,
			path.resolve('test/fixtures/srcset/_site/foo.html'),
			path.resolve('test/fixtures/srcset/_site/bar.html'),
		]);
		assert.match(response.stderr, /Successfully scanned/);
	});

	it('should crawl sitemap pages from the CLI', async () => {
		let rootUrl = '';
		server = http.createServer((request, response) => {
			if (
				request.url === '/sitemap.xml' ||
				request.url === '/custom-sitemap.xml'
			) {
				response.setHeader('content-type', 'application/xml');
				response.end(
					`<urlset><url><loc>${rootUrl}/from-sitemap</loc></url></urlset>`,
				);
				return;
			}
			response.setHeader('content-type', 'text/html');
			response.end('ok');
		});
		await new Promise<void>((resolve, reject) => {
			server.once('error', reject).listen(0, '127.0.0.1', resolve);
		});
		const { port } = server.address() as AddressInfo;
		rootUrl = `http://127.0.0.1:${port}`;

		for (const sitemapArguments of [
			['--sitemap'],
			['--sitemap-url', `${rootUrl}/custom-sitemap.xml`],
		]) {
			const response = await execa(node, [
				linkinator,
				rootUrl,
				...sitemapArguments,
				'--format',
				'json',
			]);
			const result = JSON.parse(response.stdout) as {
				links: LinkResult[];
			};
			assert.strictEqual(result.links[0].url, `${rootUrl}/from-sitemap`);
		}
	});

	it('should reject conflicting sitemap CLI flags', async () => {
		const response = await execa(
			node,
			[
				linkinator,
				'https://example.com',
				'--sitemap',
				'--sitemap-url',
				'https://example.com/custom-sitemap.xml',
			],
			{ reject: false },
		);

		assert.strictEqual(response.exitCode, 1);
		assert.match(
			response.stderr,
			/The sitemap and sitemap-url flags cannot be used together/,
		);
	});

	it('should show help if no params are provided', async () => {
		const response = await execa(node, [linkinator], {
			reject: false,
		});
		assert.match(response.stdout, /\$ linkinator LOCATION \[ --arguments ]/);
	});

	it('should show version when --version flag is used', async () => {
		const response = await execa(node, [linkinator, '--version']);
		const pkg = JSON.parse(
			fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
		) as { version: string };
		assert.strictEqual(response.stdout.trim(), pkg.version);
	});

	it('should have build/package.json with matching version', () => {
		const rootPkg = JSON.parse(
			fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
		) as { version: string };
		const buildPkg = JSON.parse(
			fs.readFileSync(
				new URL('../build/package.json', import.meta.url),
				'utf8',
			),
		) as { version: string };
		assert.strictEqual(
			buildPkg.version,
			rootPkg.version,
			'build/package.json version should match root package.json version',
		);
	});

	it('should flag skipped links', async () => {
		const response = await execa(node, [
			linkinator,
			'--verbosity',
			'INFO',
			'--skip',
			'LICENSE.md, unlinked.md',
			'test/fixtures/markdown/*.md',
		]);
		const stdout = stripAnsi(response.stdout);
		const stderr = stripAnsi(response.stderr);
		assert.match(stdout, /\[SKP]/);
		// Make sure we don't report skipped links in the count
		assert.match(stderr, /scanned 2 links/);
	});

	it('should allow --skip multiple times', async () => {
		const response = await execa(node, [
			linkinator,
			'--verbosity',
			'INFO',
			'--skip',
			'LICENSE.md',
			'--skip',
			'unlinked.md',
			'test/fixtures/markdown/README.md',
		]);
		const stdout = stripAnsi(response.stdout);
		const stderr = stripAnsi(response.stderr);
		assert.match(stdout, /\[SKP]/);
		// Make sure we don't report skipped links in the count
		assert.match(stderr, /scanned 2 links/);
	});

	it('should provide CSV if asked nicely', async () => {
		const response = await execa(node, [
			linkinator,
			'--format',
			'csv',
			'test/fixtures/markdown/README.md',
		]);
		assert.match(response.stdout, /README.md,200,OK,/);
	});

	it('should serialize errors with CSV and verbose output', async () => {
		const response = await execa(
			node,
			[
				linkinator,
				'--format',
				'csv',
				'--verbosity',
				'DEBUG',
				'test/fixtures/localbroke/README.md',
			],
			{ reject: false },
		);
		// Check that error details are present in CSV output and properly quoted
		assert.match(response.stdout, /BROKEN|404/);
		// Verify that failureDetails with special chars (newlines, quotes) are quoted
		assert.match(response.stdout, /"?\[[\s\S]*?\]"?/);
		// Should exit with code 1 since there are broken links
		assert.equal(response.exitCode, 1);
	});

	it('should provide JSON if asked nicely', async () => {
		const response = await execa(node, [
			linkinator,
			'--format',
			'json',
			'test/fixtures/markdown/README.md',
		]);
		const output = JSON.parse(response.stdout) as Record<string, string>;
		assert.ok(output.links);
	});

	it('should serialize display text through the built CLI', async () => {
		const response = await execa(node, [
			linkinator,
			'--format',
			'json',
			'test/fixtures/display-text-e2e',
		]);
		const output = JSON.parse(response.stdout) as { links: LinkResult[] };
		const findResult = (suffix: string) =>
			output.links.find((link) => link.url.endsWith(suffix));

		assert.strictEqual(findResult('target.html')?.displayText, 'Target page');
		assert.strictEqual(
			findResult('nested.html')?.displayText,
			'Read nested documentation',
		);
		assert.ok(
			!Object.hasOwn(findResult('non-anchor.html') ?? {}, 'displayText'),
		);
		assert.ok(
			!Object.hasOwn(
				output.links.find((link) => !link.parent) ?? {},
				'displayText',
			),
		);

		const csvResponse = await execa(node, [
			linkinator,
			'--format',
			'csv',
			'test/fixtures/display-text-e2e',
		]);
		assert.strictEqual(
			csvResponse.stdout.split('\n')[0],
			'url,status,state,parent,failureDetails',
		);
	});

	it('should look for linkinator.config.json in the cwd', async () => {
		const response = await execa(node, ['../../../build/src/cli.js', '.'], {
			cwd: 'test/fixtures/defaultconfig',
		});
		let output: { passed: boolean };
		try {
			output = JSON.parse(response.stdout);
			assert.strictEqual(output.passed, true);
		} catch {
			assert.fail('Expected JSON output');
		}
	});

	it('should not show links if --silent', async () => {
		const response = await execa(node, [
			linkinator,
			'--silent',
			'test/fixtures/markdown/README.md',
		]);
		assert.notMatch(response.stdout, /\[/);
	});

	it('should not show 200 links if verbosity is ERROR with JSON', async () => {
		const response = await execa(node, [
			linkinator,
			'--verbosity',
			'ERROR',
			'--format',
			'JSON',
			'test/fixtures/markdown/README.md',
		]);
		const links = JSON.parse(response.stdout).links as LinkResult[];
		for (const link of links) {
			assert.strictEqual(link.state, LinkState.BROKEN);
		}
	});

	it('should accept a server-root', async () => {
		const response = await execa(node, [
			linkinator,
			'--markdown',
			'--server-root',
			'test/fixtures/markdown',
			'README.md',
		]);
		assert.match(response.stderr, /Successfully scanned/);
	});

	it('should accept globs', async () => {
		const response = await execa(node, [
			linkinator,
			'test/fixtures/markdown/*.md',
			'test/fixtures/markdown/**/*.md',
		]);
		assert.match(response.stderr, /Successfully scanned/);
	});

	it('should throw on invalid format', async () => {
		const response = await execa(
			node,
			[linkinator, './README.md', '--format', 'LOL'],
			{
				reject: false,
			},
		);
		assert.match(response.stderr, /FORMAT must be/);
	});

	it('should throw on invalid verbosity', async () => {
		const response = await execa(
			node,
			[linkinator, './README.md', '--VERBOSITY', 'LOL'],
			{
				reject: false,
			},
		);
		assert.match(response.stderr, /VERBOSITY must be/);
	});

	it('should throw when verbosity and silent are flagged', async () => {
		const response = await execa(
			node,
			[linkinator, './README.md', '--verbosity', 'DEBUG', '--silent'],
			{
				reject: false,
			},
		);
		assert.match(response.stderr, /The SILENT and VERBOSITY flags/);
	});

	it('should show no output for verbosity=NONE', async () => {
		const response = await execa(
			node,
			[linkinator, 'test/fixtures/basic', '--verbosity', 'NONE'],
			{
				reject: false,
			},
		);
		assert.strictEqual(response.exitCode, 1);
		assert.strictEqual(response.stdout, '');
		assert.strictEqual(response.stderr, '');
	});

	it('should show callstacks for verbosity=DEBUG', async () => {
		const response = await execa(
			node,
			[linkinator, 'test/fixtures/basic', '--verbosity', 'DEBUG'],
			{
				reject: false,
			},
		);
		// Should fail with broken links
		assert.strictEqual(response.exitCode, 1);
		// With DEBUG verbosity, should show status codes in brackets
		// Strip ANSI codes before checking, as color codes can appear between brackets and digits
		const combinedOutput = stripAnsi(response.stdout + response.stderr);
		assert.ok(combinedOutput.length > 50);
		// Check for bracket notation which indicates debug output with status codes
		assert.match(combinedOutput, /\[\d+\]/);
	});

	it('should allow passing a config', async () => {
		const response = await execa(node, [
			linkinator,
			'test/fixtures/basic',
			'--config',
			'test/fixtures/config/skip-array-config.json',
		]);
		assert.strictEqual(response.exitCode, 0);
	});

	describe('user agent', () => {
		async function listenForUserAgent(expectedUserAgent: string) {
			const receivedHeaders: http.IncomingHttpHeaders[] = [];
			server = http.createServer((request, response) => {
				receivedHeaders.push(request.headers);
				response.writeHead(
					request.headers['user-agent'] === expectedUserAgent ? 200 : 403,
				);
				response.end();
			});
			await new Promise<void>((resolve) => server.listen(0, resolve));
			const address = server.address() as AddressInfo;
			return {
				receivedHeaders,
				url: `http://localhost:${address.port}`,
			};
		}

		it('should send the user agent provided on the CLI', async () => {
			const expectedUserAgent = 'ExpectedCrawler/9.9';
			const { receivedHeaders, url } =
				await listenForUserAgent(expectedUserAgent);

			const response = await execa(node, [
				linkinator,
				url,
				'--user-agent',
				expectedUserAgent,
			]);

			assert.strictEqual(response.exitCode, 0);
			assert.deepStrictEqual(
				receivedHeaders.map((headers) => headers['user-agent']),
				[expectedUserAgent],
			);
		});

		it('should send userAgent and custom headers from every config format', async () => {
			const expectedUserAgent = 'ConfigCrawler/8.8';
			const { receivedHeaders, url } =
				await listenForUserAgent(expectedUserAgent);
			const configs = [
				'test/fixtures/config/linkinator.config.json',
				'test/fixtures/config/linkinator.config.js',
				'test/fixtures/config/linkinator.config.mjs',
				'test/fixtures/config/linkinator.config.cjs',
			];

			for (const config of configs) {
				const response = await execa(node, [
					linkinator,
					url,
					'--config',
					config,
				]);
				assert.strictEqual(response.exitCode, 0);
			}

			assert.deepStrictEqual(
				receivedHeaders.map((headers) => ({
					userAgent: headers['user-agent'],
					customHeader: headers['x-config-header'],
				})),
				configs.map(() => ({
					userAgent: expectedUserAgent,
					customHeader: 'preserved',
				})),
			);
		});

		it('should prefer the CLI user agent over config', async () => {
			const expectedUserAgent = 'CliCrawler/7.7';
			const { receivedHeaders, url } =
				await listenForUserAgent(expectedUserAgent);

			const response = await execa(node, [
				linkinator,
				url,
				'--config',
				'test/fixtures/config/linkinator.config.json',
				'--user-agent',
				expectedUserAgent,
			]);

			assert.strictEqual(response.exitCode, 0);
			assert.strictEqual(receivedHeaders[0]['user-agent'], expectedUserAgent);
		});

		it('should preserve User-Agent header overrides case-insensitively', async () => {
			const expectedUserAgent = 'HeaderCrawler/6.6';
			const { receivedHeaders, url } =
				await listenForUserAgent(expectedUserAgent);

			for (const headerName of ['User-Agent', 'user-agent', 'uSeR-aGeNt']) {
				const response = await execa(node, [
					linkinator,
					url,
					'--user-agent',
					'FlagCrawler/5.5',
					'--header',
					`${headerName}:${expectedUserAgent}`,
				]);
				assert.strictEqual(response.exitCode, 0);
			}

			assert.deepStrictEqual(
				receivedHeaders.map((headers) => headers['user-agent']),
				[expectedUserAgent, expectedUserAgent, expectedUserAgent],
			);
		});
	});

	it('should fail if a url search is provided without a replacement', async () => {
		const response = await execa(
			node,
			[linkinator, '--url-rewrite-search', 'boop', 'test/fixtures/basic'],
			{
				reject: false,
			},
		);
		assert.strictEqual(response.exitCode, 1);
		assert.match(response.stderr, /flag must be used/);
	});

	it('should fail if a url replacement is provided without a search', async () => {
		const response = await execa(
			node,
			[linkinator, '--url-rewrite-replace', 'beep', 'test/fixtures/basic'],
			{
				reject: false,
			},
		);
		assert.strictEqual(response.exitCode, 1);
		assert.match(response.stderr, /flag must be used/);
	});

	it('should respect url rewrites', async () => {
		const response = await execa(node, [
			linkinator,
			'--url-rewrite-search',
			'NOTLICENSE.md',
			'--url-rewrite-replace',
			'LICENSE.md',
			'test/fixtures/rewrite/README.md',
		]);
		assert.match(response.stderr, /Successfully scanned/);
	});

	it('should respect URL rewrite expressions from config files across redirects', async () => {
		const requestedPaths: string[] = [];
		server = http.createServer((request, response) => {
			requestedPaths.push(request.url || '');
			if (request.url === '/start') {
				response.writeHead(302, { Location: '/legacy-target' });
				response.end();
				return;
			}
			if (request.url === '/rewritten-target') {
				response.writeHead(403, { 'cf-mitigated': 'challenge' });
				response.end('challenge');
				return;
			}
			response.writeHead(500);
			response.end('unrewritten target requested');
		});
		await new Promise<void>((resolve) => server.listen(0, resolve));
		const address = server.address() as AddressInfo;
		const startUrl = `http://localhost:${address.port}/start`;

		for (const config of [
			'test/fixtures/config/url-rewrite-expressions.json',
			'test/fixtures/config/url-rewrite-expressions.mjs',
		]) {
			const response = await execa(node, [
				linkinator,
				startUrl,
				'--config',
				config,
				'--format',
				'json',
				'--verbosity',
				'info',
			]);
			const result = JSON.parse(response.stdout) as {
				passed: boolean;
				links: LinkResult[];
			};
			assert.ok(result.passed);
			assert.strictEqual(result.links[0].url, startUrl);
			assert.strictEqual(result.links[0].status, 403);
			assert.strictEqual(result.links[0].state, LinkState.SKIPPED);
		}

		assert.deepStrictEqual(requestedPaths, [
			'/start',
			'/rewritten-target',
			'/start',
			'/rewritten-target',
		]);
	});

	it('should skip fragment validation without skipping the underlying URL', async () => {
		const response = await execa(node, [
			linkinator,
			'test/fixtures/fragments-client-state',
			'--check-fragments',
			'--verbosity',
			'INFO',
			'--skip-fragment',
			'^code/',
			'--skip-fragment',
			'^show-examples$,^/,^!/,^encoded\\sstate$,^missing-section$',
		]);

		assert.strictEqual(response.exitCode, 0);
		const stdout = stripAnsi(response.stdout);
		const skippedUrls = [...stdout.matchAll(/\[SKP] ([^\n]+)/g)].map((match) =>
			match[1].trim(),
		);
		assert.strictEqual(new Set(skippedUrls).size, 6);
		assert.match(stdout, /\[200].*[\\/]target\.html$/m);
		assert.match(stripAnsi(response.stderr), /Successfully scanned/);
	});

	it('should warn on retries', async () => {
		// Start a web server to return the 429
		let requestCount = 0;
		let firstRequestTime: number;
		const port = 3333;
		const delayMillis = 1000;
		server = http.createServer((_, response) => {
			if (requestCount === 0) {
				response.writeHead(429, {
					'retry-after': '1',
				});
				requestCount++;
				firstRequestTime = Date.now();
			} else {
				assert.ok(Date.now() >= firstRequestTime + delayMillis);
				response.writeHead(200);
			}

			response.end();
		});
		await new Promise<void>((r) => {
			server.listen(port, r);
		});

		const response = await execa(node, [
			linkinator,
			'--retry',
			'test/fixtures/retryCLI',
		]);
		assert.strictEqual(response.exitCode, 0);
		assert.match(
			response.stdout,
			new RegExp(`Retrying: http://localhost:${port}/`),
		);
	});

	describe('custom headers', () => {
		it('should parse header with colon in value', async () => {
			const response = await execa(
				node,
				[
					linkinator,
					'test/fixtures/basic',
					'--header',
					'X-Timestamp:2024-01-01T00:00:00Z',
				],
				{ reject: false },
			);
			// Should not throw an error about invalid format
			assert.notMatch(response.stderr, /Invalid header format/);
		});

		it('should fail on malformed header without colon', async () => {
			const response = await execa(
				node,
				[linkinator, 'test/fixtures/basic', '--header', 'InvalidHeader'],
				{ reject: false },
			);
			assert.match(
				response.stderr,
				/Invalid header format.*Use.*Header-Name:value/,
			);
		});

		it('should fail on header with empty name', async () => {
			const response = await execa(
				node,
				[linkinator, 'test/fixtures/basic', '--header', ':value'],
				{ reject: false },
			);
			assert.match(response.stderr, /Header name cannot be empty/);
		});

		it('should fail on header with empty value', async () => {
			const response = await execa(
				node,
				[linkinator, 'test/fixtures/basic', '--header', 'X-Empty:'],
				{ reject: false },
			);
			assert.match(response.stderr, /Header value cannot be empty/);
		});

		it('should accept multiple headers', async () => {
			const response = await execa(
				node,
				[
					linkinator,
					'test/fixtures/basic',
					'--header',
					'X-Custom-1:value1',
					'--header',
					'X-Custom-2:value2',
				],
				{ reject: false },
			);
			// Should not throw any header format errors
			assert.notMatch(response.stderr, /Invalid header format/);
		});

		it('should trim whitespace from header names and values', async () => {
			const response = await execa(
				node,
				[
					linkinator,
					'test/fixtures/basic',
					'--header',
					'  X-Header  :  value with spaces  ',
				],
				{ reject: false },
			);
			// Should not throw an error
			assert.notMatch(response.stderr, /Invalid header format/);
		});
	});
});
