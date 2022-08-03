import {promises as fs} from 'fs';

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
  let config: Flags = await parseConfigFile(configPath);
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

type ConfigTypes = 'js' | 'json';
type ConfigParser = (configPath: string) => Promise<Flags>;

const configParserMap: Record<ConfigTypes, ConfigParser> = {
  js: parseJsConfigFile,
  json: parseJsonConfigFile,
};

function parseConfigFile(configPath: string): Promise<Flags> {
  const typeOfConfig = getTypeOfConfig(configPath);

  const configParser = configParserMap[typeOfConfig];

  return configParser(configPath);
}

function getTypeOfConfig(configPath: string): ConfigTypes {
  const configFileExtension: string = configPath.slice(
    configPath.lastIndexOf('.') + 1
  );

  if (['js', 'json'].includes(configFileExtension)) {
    return configFileExtension as ConfigTypes;
  }

  throw new Error('Config file should be either of js, json');
}

async function parseJsConfigFile(configPath: string): Promise<Flags> {
  return {};
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
