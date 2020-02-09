# 🐿 linkinator
> A super simple site crawler and broken link checker.

[![npm version](https://img.shields.io/npm/v/linkinator.svg)](https://www.npmjs.org/package/linkinator)
[![Build Status](https://api.cirrus-ci.com/github/JustinBeckwith/linkinator.svg)](https://cirrus-ci.com/github/JustinBeckwith/linkinator)
[![codecov](https://codecov.io/gh/JustinBeckwith/linkinator/branch/master/graph/badge.svg)](https://codecov.io/gh/JustinBeckwith/linkinator)
[![Dependency Status](https://img.shields.io/david/JustinBeckwith/linkinator.svg)](https://david-dm.org/JustinBeckwith/linkinator)
[![Known Vulnerabilities](https://snyk.io/test/github/JustinBeckwith/linkinator/badge.svg)](https://snyk.io/test/github/JustinBeckwith/linkinator)
[![semantic-release](https://img.shields.io/badge/%20%20%F0%9F%93%A6%F0%9F%9A%80-semantic--release-e10079.svg)](https://github.com/semantic-release/semantic-release)


Behold my latest inator! The `linkinator` provides an API and CLI for crawling websites and validating links.  It's got a ton of sweet features:
- 🔥Easily perform scans on remote sites or local files
- 🔥Scan any element that includes links, not just `<a href>`
- 🔥Supports redirects, absolute links, relative links, all the things
- 🔥Configure specific regex patterns to skip

## Installation

```sh
$ npm install linkinator
```

## Command Usage

You can use this as a library, or as a CLI.  Let's see the CLI!

```sh
$ linkinator LOCATION [ --arguments ]

  Positional arguments

    LOCATION
      Required. Either the URL or the path on disk to check for broken links.

  Flags

    --config
        Path to the config file to use. Looks for `linkinator.config.json` by default.

    --concurrency
          The number of connections to make simultaneously. Defaults to 100.

    --recurse, -r
        Recursively follow links on the same root domain.

    --skip, -s
        List of urls in regexy form to not include in the check.

    --include, -i
        List of urls in regexy form to include.  The opposite of --skip.

    --format, -f
        Return the data in CSV or JSON format.

    --silent
        Only output broken links.

    --help
        Show this command.
```

### Command Examples

You can run a shallow scan of a website for busted links:

```sh
$ npx linkinator http://jbeckwith.com
```

That was fun.  What about local files?  The linkinator will stand up a static web server for yinz:

```sh
$ npx linkinator ./docs
```

But that only gets the top level of links.  Lets go deeper and do a full recursive scan!

```sh
$ npx linkinator ./docs --recurse
```

Aw, snap.  I didn't want that to check *those* links.  Let's skip em:

```sh
$ npx linkinator ./docs --skip www.googleapis.com
```

The `--skip` parameter will accept any regex! You can do more complex matching, or even tell it to only scan links with a given domain:

```sh
$ linkinator http://jbeckwith.com --skip '^(?!http://jbeckwith.com)'
```

Maybe you're going to pipe the output to another program.  Use the `--format` option to get JSON or CSV!

```sh
$ linkinator ./docs --format CSV
```

### Configuration file
You can pass options directly to the `linkinator` CLI, or you can define a config file.  By default, `linkinator` will look for a `linkinator.config.json` file in the current working directory.

All options are optional. It should look like this:

```json
{
  "format": "json",
  "recurse": true,
  "silent": true,
  "concurrency": 100,
  "skip": "www.googleapis.com"
}
```

To load config settings outside the CWD, you can pass the `--config` flag to the `linkinator` CLI:

```sh
$ linkinator --config /some/path/your-config.json
```

## API Usage

#### linkinator.check(options)
Asynchronous method that runs a site wide scan. Options come in the form of an object that includes:
- `path` (string) - A fully qualified path to the url to be scanned, or the path to the directory on disk that contains files to be scanned. *required*.
- `concurrency` (number) -  The number of connections to make simultaneously. Defaults to 100.
- `port` (number) - When the `path` is provided as a local path on disk, the `port` on which to start the temporary web server.  Defaults to a random high range order port.
- `recurse` (boolean) - By default, all scans are shallow.  Only the top level links on the requested page will be scanned.  By setting `recurse` to `true`, the crawler will follow all links on the page, and continue scanning links **on the same domain** for as long as it can go. Results are cached, so no worries about loops.
- `linksToSkip` (array | function) - An array of regular expression strings that should be skipped, OR an async function that's called for each link with the link URL as its only argument. Return a Promise that resolves to `true` to skip the link or `false` to check it.

#### linkinator.LinkChecker()
Constructor method that can be used to create a new `LinkChecker` instance.  This is particularly useful if you want to receive events as the crawler crawls.  Exposes the following events:
- `pagestart` (string) - Provides the url that the crawler has just started to scan.
- `link` (object) - Provides an object with
  - `url` (string) - The url that was scanned
  - `state` (string) - The result of the scan.  Potential values include `BROKEN`, `OK`, or `SKIPPED`.
  - `status` (number) - The HTTP status code of the request.

### Simple example

```js
const link = require('linkinator');

async function simple() {
  const results = await link.check({
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

### Complete example

In most cases you're going to want to respond to events, as running the check command can kinda take a long time.

```js
const link = require('linkinator');

async function complex() {
  // create a new `LinkChecker` that we'll use to run the scan.
  const checker = new link.LinkChecker();

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
    // linksToSkip: [
    //   'https://jbeckwith.com/some/link',
    //   'http://example.com'
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

## License

[MIT](LICENSE)
