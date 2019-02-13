#!/usr/bin/env node

import * as meow from 'meow';
import * as updateNotifier from 'update-notifier';
import chalk from 'chalk';
import {LinkChecker, LinkState, LinkResult, CheckOptions, check} from './index';

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
          List of urls in regexy form to not include in the check.

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
  const start = Date.now();
  console.log(`🏊‍♂️ crawling ${cli.input}`);
  const checker = new LinkChecker();
  checker.on('pagestart', url => {
    console.log(`\n Scanning ${chalk.grey(url)}`);
  });
  checker.on('link', (link: LinkResult) => {
    let state = '';
    switch (link.state) {
      case LinkState.BROKEN:
        state = `[${chalk.red(link.status!.toString())}]`;
        break;
      case LinkState.OK:
        state = `[${chalk.green(link.status!.toString())}]`;
        break;
      case LinkState.SKIPPED:
        state = `[${chalk.grey('SKP')}]`;
        break;
      default:
        throw new Error('Invalid state.');
    }
    console.log(`  ${state} ${chalk.gray(link.url)}`);
  });
  const opts: CheckOptions = {path: cli.input[0], recurse: cli.flags.recurse};
  if (cli.flags.skip) {
    const skips = cli.flags.skip as string;
    opts.linksToSkip = skips.split(' ').filter(x => !!x);
  }
  const result = await checker.check(opts);
  console.log();

  if (!result.passed) {
    const borked = result.links.filter(x => x.state === LinkState.BROKEN);
    console.error(chalk.bold(
        `${chalk.red('ERROR')} - detected ${borked.length} broken links.`));
    process.exit(1);
  }
  const total = (Date.now() - start) / 1000;
  console.log(chalk.bold(`🤖 Successfully scanned ${
      chalk.green(result.links.length.toString())} links in ${
      chalk.cyan(total.toString())} seconds.`));
}

main();
