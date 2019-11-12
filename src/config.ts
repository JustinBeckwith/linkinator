import * as fs from 'fs';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);

export interface Flags {
  concurrency?: number;
  config?: string;
  recurse?: boolean;
  skip?: string;
  format?: string;
  silent?: boolean;
}

export async function getConfig(flags: Flags) {
  // check to see if a config file path was passed
  const configPath = flags.config || 'linkinator.config.json';
  let configData: string | undefined;
  try {
    configData = await readFile(configPath, { encoding: 'utf8' });
  } catch (e) {
    if (flags.config) {
      console.error(`Unable to find config file ${flags.config}`);
      throw e;
    }
  }

  let config: Flags = {};
  if (configData) {
    config = JSON.parse(configData);
  }
  // `meow` is set up to pass boolean flags as `undefined` if not passed.
  // copy the struct, and delete properties that are `undefined` so the merge
  // doesn't blast away config level settings.
  const strippedFlags = Object.assign({}, flags);
  Object.entries(strippedFlags).forEach(([key, value]) => {
    if (typeof value === 'undefined') {
      delete (strippedFlags as { [index: string]: {} })[key];
    }
  });

  // combine the flags passed on the CLI with the flags in the config file,
  // with CLI flags getting precedence
  config = Object.assign({}, config, strippedFlags);
  return config;
}
