import { env } from '../config/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

const configuredLevel: LogLevel = (env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[configuredLevel];
}

function serializeMeta(meta: unknown): unknown {
  if (meta instanceof Error) {
    return { name: meta.name, message: meta.message, stack: meta.stack };
  }
  if (meta && typeof meta === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
      result[k] = v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v;
    }
    return result;
  }
  return meta;
}

function format(level: LogLevel, message: string, meta?: unknown): string {
  const timestamp = new Date().toISOString();
  const metaStr = meta ? ` ${JSON.stringify(serializeMeta(meta))}` : '';
  return `[${timestamp}] ${level.toUpperCase()} ${message}${metaStr}`;
}

export const logger = {
  debug: (msg: string, meta?: unknown) => {
    if (shouldLog('debug')) console.debug(format('debug', msg, meta));
  },
  info: (msg: string, meta?: unknown) => {
    if (shouldLog('info')) console.info(format('info', msg, meta));
  },
  warn: (msg: string, meta?: unknown) => {
    if (shouldLog('warn')) console.warn(format('warn', msg, meta));
  },
  error: (msg: string, meta?: unknown) => {
    if (shouldLog('error')) console.error(format('error', msg, meta));
  },
};
