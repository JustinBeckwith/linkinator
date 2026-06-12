export declare enum LogLevel {
    DEBUG = 0,
    INFO = 1,
    WARNING = 2,
    ERROR = 3,
    NONE = 4
}
export declare enum Format {
    TEXT = 0,
    JSON = 1,
    CSV = 2
}
export declare class Logger {
    level: LogLevel;
    format: Format;
    constructor(level: LogLevel, format: Format);
    debug(message?: string): void;
    info(message?: string): void;
    warn(message?: string): void;
    error(message?: string): void;
}
