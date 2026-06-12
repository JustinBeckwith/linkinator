import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
const validConfigExtensions = ['.js', '.mjs', '.cjs', '.json'];
export async function getConfig(flags) {
    // Check to see if a config file path was passed
    let config;
    if (flags.config) {
        config = await parseConfigFile(flags.config);
    }
    else {
        config = (await tryGetDefaultConfig()) || {};
    }
    // `meow` is set up to pass boolean flags as `undefined` if not passed.
    // copy the struct, and delete properties that are `undefined` so the merge
    // doesn't blast away config level settings.
    const strippedFlags = { ...flags };
    for (const [key, value] of Object.entries(strippedFlags)) {
        if (value === undefined || (Array.isArray(value) && value.length === 0)) {
            delete strippedFlags[key];
        }
    }
    // Combine the flags passed on the CLI with the flags in the config file,
    // with CLI flags getting precedence
    config = { ...config, ...strippedFlags };
    return config;
}
/**
 * Attempt to load `linkinator.config.json`, assuming the user hasn't
 * passed a specific path to a config.
 * @returns The contents of the default config if present, or an empty config.
 */
async function tryGetDefaultConfig() {
    const defaultConfigPath = path.join(process.cwd(), 'linkinator.config.json');
    try {
        const config = await parseConfigFile(defaultConfigPath);
        return config;
    }
    catch {
        return {};
    }
}
async function parseConfigFile(configPath) {
    const typeOfConfig = getTypeOfConfig(configPath);
    switch (typeOfConfig) {
        case '.json': {
            return readJsonConfigFile(configPath);
        }
        case '.js':
        case '.mjs':
        case '.cjs': {
            return importConfigFile(configPath);
        }
        default: {
            throw new Error(`Config file ${configPath} is invalid`);
        }
    }
}
function getTypeOfConfig(configPath) {
    // Returning json in case file doesn't have an extension for backward compatibility
    const configExtension = path.extname(configPath) || '.json';
    if (validConfigExtensions.includes(configExtension)) {
        return configExtension;
    }
    throw new Error(`Config file should be either of extensions ${validConfigExtensions.join(',')}`);
}
async function importConfigFile(configPath) {
    const config = (await import(`file://${path.resolve(process.cwd(), configPath)}`));
    return config.default;
}
async function readJsonConfigFile(configPath) {
    const configFileContents = await fs.readFile(configPath, {
        encoding: 'utf8',
    });
    try {
        return JSON.parse(configFileContents);
    }
    catch (error) {
        throw new Error(`Error parsing ${configPath}: ${error}`);
    }
}
