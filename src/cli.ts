#!/usr/bin/env node

import * as meow from 'meow';
import * as updateNotifier from 'update-notifier';
import {LinkChecker, CheckOptions} from './index';

const pkg = require('../../package.json');
updateNotifier({pkg}).notify();

const cli = meow(
    `
    Usage
      $ linkinator LOCATION [ --arguments ]

    Positional arguments

      LOCATION
        Required. Either the URL or the path on disk to check for broken links.

    Flags
      --recurse, -r
          Recurively follow links on the same root domain.

      --skip, -s
          List of urls or globb'd urls to not include in the check.

      --help
          Show this command.

    Examples
      $ linkinator docs/
      $ linkinator https://www.google.com
      $ linkinator . --recurse
      $ linkinator . --skip www.googleapis.com
`,
    {
      flags: {
        recurse: {type: 'boolean', alias: 'r'},
        skip: {type: 'string', alias: 's'},
      }
    });

async function main() {
  if (cli.input.length !== 1) {
    cli.showHelp();
    return;
  }
  const checker = new LinkChecker();
  checker.on('link', link => {
    console.log(link);
  });
  const opts: CheckOptions = {path: cli.input[0], recurse: cli.flags.recurse};
  if (cli.flags.skip) {
    const skips = cli.flags.skip as string;
    opts.linksToSkip = skips.split(' ').filter(x => !!x);
  }
  const result = await checker.check(opts);
  if (!result.passed) {
    process.exit(1);
  }
}

main();
