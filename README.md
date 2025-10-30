[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/justinbeckwith-linkinator-badge.png)](https://mseep.ai/app/justinbeckwith-linkinator)

# 🐿 linkinator

> A super simple site crawler and broken link checker.

![linkinator](https://raw.githubusercontent.com/JustinBeckwith/linkinator/main/site/linkinator.webp)

[![npm version](https://img.shields.io/npm/v/linkinator)](https://www.npmjs.com/package/linkinator)
[![codecov](https://img.shields.io/codecov/c/github/JustinBeckwith/linkinator/main)](https://app.codecov.io/gh/JustinBeckwith/linkinator)
[![Checked with Biome](https://img.shields.io/badge/Checked_with-Biome-60a5fa?style=flat&logo=biome)](https://biomejs.dev)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079)](https://github.com/semantic-release/semantic-release)

Behold my latest inator! The `linkinator` provides an API and CLI for crawling websites and validating links.  It's got a ton of sweet features:

- 🔥 Easily perform scans on remote sites or local files
- 🔥 Scan any element that includes links, not just `<a href>`
- 🔥 Supports redirects, absolute links, relative links, all the things
- 🔥 Configure specific regex patterns to skip
- 🔥 Scan markdown files without transpilation

## Installation

### Node.js / npm

```sh
npm install linkinator
```

### Standalone Binaries (no Node.js required)

Don't have Node.js installed? No problem! Browse all releases at [github.com/JustinBeckwith/linkinator/releases](https://github.com/JustinBeckwith/linkinator/releases).

These binaries are completely standalone - no runtime dependencies needed. Just download, make executable (Linux/macOS), and run!

## Command Usage

You can use this as a library, or as a CLI.  Let's see the CLI!

```text
$ linkinator LOCATIONS [ --arguments ]

  Positional arguments

    LOCATIONS
      Required. Either the URLs or the paths on disk to check for broken links.
      Supports multiple paths, and globs.

  Flags

    --concurrency
          The number of connections to make simultaneously. Defaults to 100.

    --config
        Path to the config file to use. Looks for `linkinator.config.json` by default.

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
        List of urls in regexy form to not include in the check. Can be repeated multiple times.

    --status-code
        Control how specific HTTP status codes are handled. Format: "CODE:ACTION"
        where CODE is a numeric status code (e.g., 403) or pattern (e.g., 4xx, 5xx)
        and ACTION is one of: ok (success), warn (success with warning),
        skip (ignore link), or error (force failure).
        Can be repeated multiple times. Example: --status-code "403:warn" --status-code "5xx:skip"

    --timeout
        Request timeout in ms.  Defaults to 0 (no timeout).

    --url-rewrite-search
        Pattern to search for in urls.  Must be used with --url-rewrite-replace.

    --url-rewrite-replace
        Expression used to replace search content.  Must be used with --url-rewrite-search.
        Example: --url-rewrite-search "https://example\.com" --url-rewrite-replace "http://localhost:3000"

    --user-agent
        The user agent passed in all HTTP requests. Defaults to 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.117 Safari/537.36'

    --verbosity
        Override the default verbosity for this command. Available options are
        'debug', 'info', 'warning', 'error', and 'none'.  Defaults to 'warning'.
```

### Command Examples

You can run a shallow scan of a website for busted links:

```sh
npx linkinator https://jbeckwith.com
```

That was fun.  What about local files?  The linkinator will stand up a static web server for yinz:

```sh
npx linkinator ./docs
```

But that only gets the top level of links.  Lets go deeper and do a full recursive scan!

```sh
npx linkinator ./docs --recurse
```

Aw, snap.  I didn't want that to check *those* links.  Let's skip em:

```sh
npx linkinator ./docs --skip www.googleapis.com
```

Need to skip multiple patterns? Just use `--skip` multiple times:

```sh
npx linkinator ./docs --skip www.googleapis.com --skip example.com --skip github.com
```

The `--skip` parameter will accept any regex! You can do more complex matching, or even tell it to only scan links with a given domain:

```sh
npx linkinator http://jbeckwith.com --skip '^(?!http://jbeckwith.com)'
```

Maybe you're going to pipe the output to another program.  Use the `--format` option to get JSON or CSV!

```sh
npx linkinator ./docs --format CSV
```

Let's make sure the `README.md` in our repo doesn't have any busted links:

```sh
npx linkinator ./README.md --markdown
```

You know what, we better check all of the markdown files!

```sh
npx linkinator "**/*.md" --markdown
```

Need to check a static site with clean URLs (extensionless links)?

```sh
npx linkinator ./dist --recurse --clean-urls
```

### 🌰 Strict Link Checking

Like a diligent squirrel inspecting every acorn before storing it for winter, you can configure linkinator to be *extremely* picky about your links. Here's how to go full squirrel:

```sh
npx linkinator . --recurse --check-css --check-fragments --redirects error --require-https error
```

- Scurries through your entire site recursively
- Sniffs out broken fragment identifiers (like `#section-name`)
- Gets angry at any redirects (a suspicious acorn is a bad acorn!)
- Only accepts HTTPS acorns (HTTP is a rotten nut!)

### Configuration file

You can pass options directly to the `linkinator` CLI, or you can define a config file.  By default, `linkinator` will look for a `linkinator.config.json` file in the current working directory.

All options are optional. It should look like this:

```json
{
  "concurrency": 100,
  "config": "string",
  "recurse": true,
  "skip": "www.googleapis.com",
  "format": "json",
  "silent": true,
  "verbosity": "error",
  "timeout": 0,
  "markdown": true,
  "checkCss": true,
  "checkFragments": true,
  "serverRoot": "./",
  "directoryListing": true,
  "cleanUrls": true,
  "redirects": "allow",
  "requireHttps": "off",
  "allowInsecureCerts": false,
  "retry": true,
  "retryErrors": true,
  "retryErrorsCount": 3,
  "retryErrorsJitter": 5,
  "urlRewriteSearch": "https://example\\.com",
  "urlRewriteReplace": "http://localhost:3000",
  "userAgent": "Mozilla/4.0 (compatible; MSIE 6.0; MSIE 5.5; Windows NT 5.1)",
  "header": ["Authorization:Bearer TOKEN", "X-Custom-Header:value"],
  "statusCodes": {
    "403": "warn",
    "404": "skip",
    "4xx": "warn",
    "5xx": "skip"
  }
}
```

For skipping multiple URL patterns, use an array:

```json
{
  "skip": ["www.googleapis.com", "example.com", "github.com"]
}
```

### Handling Specific Status Codes

Sometimes you need fine-grained control over how linkinator handles specific HTTP status codes. For example, some sites aggressively block crawlers with 403 responses, or you might want to treat certain errors as warnings rather than failures.

Use the `--status-code` flag on the command line:

```sh
# Treat 403 as a warning instead of an error
npx linkinator . --status-code "403:warn"

# Skip 404 errors entirely
npx linkinator . --status-code "404:skip"

# Combine multiple status code rules
npx linkinator . --status-code "403:warn" --status-code "5xx:skip"
```

Or configure it in your `linkinator.config.json`:

```json
{
  "statusCodes": {
    "403": "warn",
    "404": "skip",
    "4xx": "warn",
    "5xx": "skip"
  }
}
```

Available actions:
- **`ok`** - Treat as success (link passes)
- **`warn`** - Treat as success but emit a warning message
- **`skip`** - Ignore the link entirely (like bot-protected links)
- **`error`** - Force the link to fail

You can use specific codes (`"403"`) or patterns (`"4xx"`, `"5xx"`). Specific codes take priority over patterns.

To load config settings outside the CWD, you can pass the `--config` flag to the `linkinator` CLI:

```sh
npx linkinator --config /some/path/your-config.json
```

## GitHub Actions

You can use `linkinator` as a GitHub Action as well, using [JustinBeckwith/linkinator-action](https://github.com/JustinBeckwith/linkinator-action):

```yaml
on:
  push:
    branches:
      - main
  pull_request:
name: ci
jobs:
  linkinator:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: JustinBeckwith/linkinator-action@v2
        with:
          paths: README.md
```

To see all options or to learn more, visit [JustinBeckwith/linkinator-action](https://github.com/JustinBeckwith/linkinator-action).

### Model Context Protocol (MCP)

You can also use `linkinator` in AI assistants like Claude through the Model Context Protocol using [JustinBeckwith/linkinator-mcp](https://github.com/JustinBeckwith/linkinator-mcp).

The linkinator-mcp server brings link-checking capabilities directly to AI assistants, enabling automated scanning of webpages and local files through natural language prompts.

**Installation:**

```sh
npx install-mcp linkinator-mcp --client claude
```

This will automatically configure the MCP server for Claude Desktop, Claude Code, Cursor, and other compatible clients.

**Usage:**

Once installed, you can check links through natural language:
- "Check all links on https://example.com"
- "Scan my documentation recursively and validate anchor fragments"
- "Check local files at /path/to/docs"

For more details and manual configuration options, visit [JustinBeckwith/linkinator-mcp](https://github.com/JustinBeckwith/linkinator-mcp).

## API Usage

### linkinator.check(options)

Asynchronous method that runs a site wide scan. Options come in the form of an object that includes:

- `path` (string|string[]) - A fully qualified path to the url to be scanned, or the path(s) to the directory on disk that contains files to be scanned. *required*.
- `concurrency` (number) -  The number of connections to make simultaneously. Defaults to 100.
- `port` (number) - When the `path` is provided as a local path on disk, the `port` on which to start the temporary web server.  Defaults to a random high range order port.
- `recurse` (boolean) - By default, all scans are shallow.  Only the top level links on the requested page will be scanned.  By setting `recurse` to `true`, the crawler will follow all links on the page, and continue scanning links **on the same domain** for as long as it can go. Results are cached, so no worries about loops.
- `checkCss` (boolean) - Extract and check URLs found in CSS properties (inline styles, `<style>` tags, and external CSS files when using `recurse`). This includes `url()` functions, `@import` statements, and other CSS URL references. Defaults to `false`.
- `retry` (boolean|RetryConfig) - Automatically retry requests that respond with an HTTP 429, and include a `retry-after` header.  The `RetryConfig` option is a placeholder for fine-grained controls to be implemented at a later time, and is only included here to signal forward-compatibility.
- `serverRoot` (string) - When scanning a locally directory, customize the location on disk
where the server is started.  Defaults to the path passed in `path`.
- `timeout` (number) - By default, requests made by linkinator do not time out (or follow the settings of the OS).  This option (in milliseconds) will fail requests after the configured amount of time.
- `markdown` (boolean) - Automatically parse and scan markdown if scanning from a location on disk.
- `linksToSkip` (array | function) - An array of regular expression strings that should be skipped (e.g., `['example.com', 'github.com', '^http://']`), OR an async function that's called for each link with the link URL as its only argument. Return a Promise that resolves to `true` to skip the link or `false` to check it.
- `directoryListing` (boolean) - Automatically serve a static file listing page when serving a directory.  Defaults to `false`.
- `cleanUrls` (boolean) - Enable clean URLs (extensionless links). When enabled, links like `/about` will automatically resolve to `/about.html` if the file exists. Mimics behavior of modern static hosting platforms like Vercel. Defaults to `false`.
- `urlRewriteExpressions` (array) - Collection of objects that contain a search pattern, and replacement. Use this to rewrite URLs before they are checked. For example, to rewrite a production URL to a local development URL:
  ```javascript
  urlRewriteExpressions: [
    {
      pattern: /https:\/\/example\.com/,
      replacement: 'http://localhost:3000'
    }
  ]
  ```
- `userAgent` (string) - The [user agent](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/User-Agent) that should be passed with each request. This uses a reasonable default.
- `headers` (object) - Custom HTTP headers to include in all requests. Object with header names as keys and values as strings. These headers are merged with the default headers (including User-Agent). Example: `{ 'Authorization': 'Bearer token', 'X-Custom': 'value' }`.

### linkinator.LinkChecker()

Constructor method that can be used to create a new `LinkChecker` instance.  This is particularly useful if you want to receive events as the crawler crawls.  Exposes the following events:

- `pagestart` (string) - Provides the url that the crawler has just started to scan.
- `link` (object) - Provides an object with
  - `url` (string) - The url that was scanned
  - `state` (string) - The result of the scan.  Potential values include `BROKEN`, `OK`, or `SKIPPED`.
  - `status` (number) - The HTTP status code of the request.

### Examples

#### Simple example

```js
import { LinkChecker } from 'linkinator';

async function simple() {
  const checker = new LinkChecker();
  const results = await checker.check({
    path: 'http://example.com'
  });

  // To see if all the links passed, you can check `passed`
  console.log(`Passed: ${results.passed}`);

  // Show the list of scanned links and their results
  console.log(results);

  // Example output:
  // {
  //   passed: true,
  //   links: [
  //     {
  //       url: 'http://example.com',
  //       status: 200,
  //       state: 'OK'
  //     },
  //     {
  //       url: 'http://www.iana.org/domains/example',
  //       status: 200,
  //       state: 'OK'
  //     }
  //   ]
  // }
}
simple();
```

#### Complete example

In most cases you're going to want to respond to events, as running the check command can kinda take a long time.

```js
import { LinkChecker } from 'linkinator';

async function complex() {
  // create a new `LinkChecker` that we'll use to run the scan.
  const checker = new LinkChecker();

  // Respond to the beginning of a new page being scanned
  checker.on('pagestart', url => {
    console.log(`Scanning ${url}`);
  });

  // After a page is scanned, check out the results!
  checker.on('link', result => {

    // check the specific url that was scanned
    console.log(`  ${result.url}`);

    // How did the scan go?  Potential states are `BROKEN`, `OK`, and `SKIPPED`
    console.log(`  ${result.state}`);

    // What was the status code of the response?
    console.log(`  ${result.status}`);

    // What page linked here?
    console.log(`  ${result.parent}`);
  });

  // Go ahead and start the scan! As events occur, we will see them above.
  const result = await checker.check({
    path: 'http://example.com',
    // port: 8673,
    // recurse: true,
    // Skip multiple URL patterns using an array of regex strings
    // linksToSkip: [
    //   'example.com/skip-this',
    //   'github.com',
    //   '^https://restricted'
    // ]
  });

  // Check to see if the scan passed!
  console.log(result.passed ? 'PASSED :D' : 'FAILED :(');

  // How many links did we scan?
  console.log(`Scanned total of ${result.links.length} links!`);

  // The final result will contain the list of checked links, and the pass/fail
  const brokeLinksCount = result.links.filter(x => x.state === 'BROKEN');
  console.log(`Detected ${brokeLinksCount.length} broken links.`);
}

complex();
```

#### Skipping links example

```js
import { LinkChecker } from 'linkinator';

async function skipExample() {
  const checker = new LinkChecker();

  // Skip multiple URL patterns using an array
  const result = await checker.check({
    path: 'https://example.com',
    recurse: true,
    linksToSkip: [
      'www.google.com',           // Skip all Google links
      'example.com/skip-me',      // Skip specific paths
      '^https://internal.corp'    // Skip all internal corp links
    ]
  });

  console.log(`Scanned ${result.links.length} links`);
}

skipExample();
```

#### Custom headers example

Pass custom HTTP headers for authentication or other purposes:

```js
import { LinkChecker } from 'linkinator';

async function customHeadersExample() {
  const checker = new LinkChecker();

  const result = await checker.check({
    path: 'https://example.com',
    headers: {
      'Authorization': 'Bearer YOUR_TOKEN_HERE',
      'X-Custom-Header': 'custom-value',
      'X-API-Key': 'your-api-key'
    }
  });

  console.log(`Scan completed: ${result.passed ? 'PASSED' : 'FAILED'}`);
}

customHeadersExample();
```

**CLI Usage:**

```sh
# Single header
npx linkinator https://example.com --header "Authorization:Bearer YOUR_TOKEN"

# Multiple headers
npx linkinator https://example.com \
  --header "Authorization:Bearer YOUR_TOKEN" \
  --header "X-API-Key:your-api-key"

# Header values can contain colons (e.g., timestamps)
npx linkinator https://example.com --header "X-Timestamp:2024-01-01T00:00:00Z"
```

**Common use cases:**

- **Authentication**: Pass JWT tokens or API keys to check authenticated pages
- **Custom User-Agent**: Override the default user agent (also available via `--user-agent` flag)
- **API requirements**: Send headers required by API endpoints
- **Testing**: Simulate different client configurations

**Config file:**

```json
{
  "header": [
    "Authorization:Bearer YOUR_TOKEN",
    "X-Custom-Header:value"
  ]
}
```

## Tips & Tricks

### Using a proxy

This library supports proxies via the `HTTP_PROXY` and `HTTPS_PROXY` environment variables.  This [guide](https://www.golinuxcloud.com/set-up-proxy-http-proxy-environment-variable/) provides a nice overview of how to format and set these variables.

### Globbing

You may have noticed in the example, when using a glob the pattern is encapsulated in quotes:

```sh
npx linkinator "**/*.md" --markdown
```

Without the quotes, some shells will attempt to expand the glob paths on their own.  Various shells (bash, zsh) have different, somewhat unpredictable behaviors when left to their own devices.  Using the quotes ensures consistent, predictable behavior by letting the library expand the pattern.

### Debugging

Oftentimes when a link fails, it's an easy to spot typo, or a clear 404.  Other times ... you may need more details on exactly what went wrong.  To see a full call stack for the HTTP request failure, use `--verbosity DEBUG`:

```sh
npx linkinator https://jbeckwith.com --verbosity DEBUG
```

### Controlling Output

The `--verbosity` flag offers preset options for controlling the output, but you may want more control.  Using [`jq`](https://stedolan.github.io/jq/) and `--format JSON` - you can do just that!

```sh
npx linkinator https://jbeckwith.com --verbosity DEBUG --format JSON | jq '.links | .[] | select(.state | contains("BROKEN"))'
```

### Bot Protection (Status 403 and 999)

Many websites use bot protection systems that block automated tools like linkinator. When bot protection is detected, linkinator **skips** these links rather than marking them as broken or valid, since it cannot verify whether the URL is actually valid or broken.

- The link appears with `[403] (bot-protected)` or `[999] (bot-protected)` in the output
- It does NOT count as a broken link or cause checks to fail
- It is not counted in the "scanned links" total
- Only visible at INFO verbosity level or higher

This approach is taken because we cannot distinguish between valid and invalid URLs when blocked.  

#### Cloudflare Bot Protection (Status 403)

Cloudflare bot protection returns a `403` status code with the `cf-mitigated` response header when detecting automated tools. Linkinator automatically detects this scenario and skips these links.

#### LinkedIn and Other Sites (Status 999)

LinkedIn and some other sites return a non-standard `999` status code to block automated requests. This status code is used regardless of whether the URL is valid or invalid.

## License

[MIT](LICENSE.md)
