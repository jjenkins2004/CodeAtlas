import pino, { type Logger as PinoLogger } from "pino";

export type LogMode = "normal" | "verbose";

const LOG_MODE_ENV = "CODEATLAS_LOG_MODE";

function resolveLogMode(): LogMode {
  const mode = process.env[LOG_MODE_ENV]?.trim().toLowerCase();

  if (mode === "verbose") {
    return "verbose";
  }

  return "normal";
}

function resolveLogLevel(mode: LogMode): pino.LevelWithSilent {
  const configuredLevel = process.env["LOG_LEVEL"]?.trim().toLowerCase();

  if (configuredLevel) {
    return configuredLevel as pino.LevelWithSilent;
  }

  return mode === "verbose" ? "debug" : "info";
}

export const logMode = resolveLogMode();

export const logger = pino({
  name: "codeatlas",
  level: resolveLogLevel(logMode),
  base: {
    service: "codeatlas",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});

export function createLogger(bindings: Record<string, unknown>): PinoLogger {
  return logger.child(bindings);
}

export function isVerboseLoggingEnabled(): boolean {
  return logger.isLevelEnabled("debug");
}

export function getLoggerModeSummary(): {
  mode: LogMode;
  loggerLevel: string;
  envVar: string;
} {
  return {
    mode: logMode,
    loggerLevel: logger.level,
    envVar: LOG_MODE_ENV,
  };
}
