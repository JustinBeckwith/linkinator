export var LogLevel;
(function (LogLevel) {
    LogLevel[LogLevel["DEBUG"] = 0] = "DEBUG";
    LogLevel[LogLevel["INFO"] = 1] = "INFO";
    LogLevel[LogLevel["WARNING"] = 2] = "WARNING";
    LogLevel[LogLevel["ERROR"] = 3] = "ERROR";
    LogLevel[LogLevel["NONE"] = 4] = "NONE";
})(LogLevel || (LogLevel = {}));
export var Format;
(function (Format) {
    Format[Format["TEXT"] = 0] = "TEXT";
    Format[Format["JSON"] = 1] = "JSON";
    Format[Format["CSV"] = 2] = "CSV";
})(Format || (Format = {}));
export class Logger {
    level;
    format;
    constructor(level, format) {
        this.level = level;
        this.format = format;
    }
    debug(message) {
        if (this.level <= LogLevel.DEBUG && this.format === Format.TEXT) {
            console.debug(message);
        }
    }
    info(message) {
        if (this.level <= LogLevel.INFO && this.format === Format.TEXT) {
            console.info(message);
        }
    }
    warn(message) {
        if (this.level <= LogLevel.WARNING && this.format === Format.TEXT) {
            // Note: this is `console.log` on purpose.  `console.warn` maps to
            // `console.error`, which would print these messages to stderr.
            console.log(message);
        }
    }
    error(message) {
        if (this.level <= LogLevel.ERROR && this.format === Format.TEXT) {
            console.error(message);
        }
    }
}
