import {promises as fs} from 'fs';
import {createRequire} from 'module';

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

const validConfigExtensions = ['js', 'mjs', 'cjs','json'];

export async function getConfig(flags: Flags) {
  // check to see if a config file path was passed
  const configPath = flags.config || 'linkinator.config.json';
  let config: Flags = {};

  if (flags.config) {
    config = await parseConfigFile(configPath);
  }
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

type ConfigTypes = typeof validConfigExtensions[number];
type ConfigParser = (configPath: string) => Promise<Flags>;

const configParserMap: Record<ConfigTypes, ConfigParser> = {
  js: parseJsConfigFile,
  json: parseJsonConfigFile,
  mjs: parseModuleJsConfigFile,
  cjs: parseCommonJsConfigFile,
};

async function parseConfigFile(configPath: string): Promise<Flags> {
  const typeOfConfig = getTypeOfConfig(configPath);

  const configParser = configParserMap[typeOfConfig];

  if (configParser) {
    return configParser(configPath);
  }

  throw new Error(`Config file ${configPath} is invalid`);
}

function getTypeOfConfig(configPath: string): ConfigTypes {
  const lastDotIndex = configPath.lastIndexOf('.');

  // Returning json in case file doesn't have an extension for backward compatibility
  if (lastDotIndex === -1) return 'json';

  const configFileExtension: string = configPath.slice(lastDotIndex + 1);

  if (validConfigExtensions.includes(configFileExtension)) {
    return configFileExtension as ConfigTypes;
  }

  throw new Error('Config file should be either of js, json');
}

async function parseModuleJsConfigFile(configPath: string): Promise<Flags> {
  const config = (await import(configPath)).default;

  return config;
}

async function parseCommonJsConfigFile(configPath: string): Promise<Flags> {
  const require = createRequire(import.meta.url);
  const config = require(configPath);
  return config;
}

async function parseJsConfigFile(configPath: string): Promise<Flags> {
  // TODO: Added support for both commonjs & ES Modules
  const config = (await import(configPath)).default;

  return config;
}

async function parseJsonConfigFile(configPath: string): Promise<Flags> {
  try {
    const configFileContents: string = await fs.readFile(configPath, {
      encoding: 'utf-8',
    });
    return JSON.parse(configFileContents);
  } catch (e) {
    console.error(`Unable to read or parse the JSON config file ${configPath}`);
    throw e;
  }
}
