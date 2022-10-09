import {promises as fs} from 'fs';
import path from 'path';

export interface Flags {
  concurrency?: number;
  config?: string;
  recurse?: boolean;
  skip?: string | string[];
  format?: string;
  silent?: boolean;
  verbosity?: string;
  timeout?: number;
  markdown?: boolean;
  serverRoot?: string;
  directoryListing?: boolean;
  retry?: boolean;
  retryErrors?: boolean;
  retryErrorsCount?: number;
  retryErrorsJitter?: number;
  urlRewriteSearch?: string;
  urlRewriteReplace?: string;
}

export async function getConfig(flags: Flags) {
  // check to see if a config file path was passed
  const configPath = flags.config || 'linkinator.config.json';
  let config: Flags = {};

  if (flags.config) {
    config = await parseConfigFile(configPath);
  }

  // `meow` is set up to pass boolean flags as `undefined` if not passed.
  // copy the struct, and delete properties that are `undefined` so the merge
  // doesn't blast away config level settings.
  const strippedFlags = Object.assign({}, flags);
  Object.entries(strippedFlags).forEach(([key, value]) => {
    if (
      typeof value === 'undefined' ||
      (Array.isArray(value) && value.length === 0)
    ) {
      delete (strippedFlags as {[index: string]: {}})[key];
    }
  });

  // combine the flags passed on the CLI with the flags in the config file,
  // with CLI flags getting precedence
  config = Object.assign({}, config, strippedFlags);
  return config;
}

const validConfigExtensions = ['.js', '.mjs', '.cjs', '.json'];
type ConfigExtensions = typeof validConfigExtensions[number];

async function parseConfigFile(configPath: string): Promise<Flags> {
  const typeOfConfig = getTypeOfConfig(configPath);

  switch (typeOfConfig) {
    case '.json':
      return readJsonConfigFile(configPath);
    case '.js':
    case '.mjs':
    case '.cjs':
      return importConfigFile(configPath);
  }

  throw new Error(`Config file ${configPath} is invalid`);
}

function getTypeOfConfig(configPath: string): ConfigExtensions {
  // Returning json in case file doesn't have an extension for backward compatibility
  const configExtension = path.extname(configPath) || '.json';

  if (validConfigExtensions.includes(configExtension)) {
    return configExtension as ConfigExtensions;
  }

  throw new Error(
    `Config file should be either of extensions ${validConfigExtensions.join(
      ','
    )}`
  );
}

async function importConfigFile(configPath: string): Promise<Flags> {
  const config = (await import(path.join(process.cwd(), configPath))).default;

  return config;
}

async function readJsonConfigFile(configPath: string): Promise<Flags> {
  const configFileContents = await fs.readFile(configPath, {
    encoding: 'utf-8',
  });

  return JSON.parse(configFileContents);
}
