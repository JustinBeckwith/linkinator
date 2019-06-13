import * as fs from 'fs';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);

export interface Flags {
  config?: string;
  recurse?: boolean;
  skip?: string;
  format?: string;
  silent?: boolean;
}

export async function getConfig(flags: Flags) {
  // check to see if a config file path was passed
  const configPath = flags.config || 'linkinator.config.js';
  let configData: string | undefined;
  if (flags.config) {
    try {
      configData = await readFile(configPath, { encoding: 'utf8' });
    } catch (e) {
      if (flags.config) {
        console.error(`Unable to find config file ${flags.config}`);
        throw e;
      }
    }
  }

  let config: Flags = {};
  if (configData) {
    config = JSON.parse(configData);
  }
  config = Object.assign({}, config, flags);
  return config;
}
