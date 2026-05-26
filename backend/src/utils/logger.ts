import { env } from '../config/env';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVELS: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const configuredLevel: LogLevel = (env.LOG_LEVEL as LogLevel) || 'info';

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[configuredLevel];
}

function serializeMeta(meta: unknown): Record<string, unknown> {
  if (meta instanceof Error) {
    return { err: { name: meta.name, message: meta.message, stack: meta.stack } };
  }
  if (meta && typeof meta === 'object') {
    const result: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(meta as Record<string, unknown>)) {
      result[k] = v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v;
    }
    return result;
  }
  return {};
}

function emit(level: LogLevel, message: string, meta?: unknown): void {
  if (!shouldLog(level)) return;
  const entry: Record<string, unknown> = {
    ts: new Date().toISOString(),
    level: level.toUpperCase(),
    msg: message,
    env: env.NODE_ENV,
    ...( meta !== undefined ? serializeMeta(meta) : {}),
  };
  const line = JSON.stringify(entry);
  switch (level) {
    case 'debug': console.debug(line); break;
    case 'info':  console.info(line);  break;
    case 'warn':  console.warn(line);  break;
    case 'error': console.error(line); break;
  }
}

export const logger = {
  debug: (msg: string, meta?: unknown) => emit('debug', msg, meta),
  info:  (msg: string, meta?: unknown) => emit('info',  msg, meta),
  warn:  (msg: string, meta?: unknown) => emit('warn',  msg, meta),
  error: (msg: string, meta?: unknown) => emit('error', msg, meta),
  http: (method: string, url: string, status: number, ms: number, requestId: string) => {
    const level: LogLevel = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'debug';
    emit(level, 'http', { method, url, status, ms, requestId });
  },
};
