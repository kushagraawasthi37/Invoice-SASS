import { env } from './env';
import { logger } from '../utils/logger';

interface RedisLike {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode: 'EX', ttl: number): Promise<unknown>;
  incr(key: string): Promise<number>;
  expire(key: string, ttl: number): Promise<unknown>;
}

// In-memory fallback when Redis is not configured
class MemStore implements RedisLike {
  private store = new Map<string, { value: string; expiresAt: number }>();

  private clean(key: string): string | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) { this.store.delete(key); return null; }
    return entry.value;
  }

  async get(key: string): Promise<string | null> {
    return this.clean(key);
  }

  async set(key: string, value: string, _mode: 'EX', ttl: number): Promise<unknown> {
    this.store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
    return 'OK';
  }

  async incr(key: string): Promise<number> {
    const cur = this.clean(key);
    const next = (cur ? parseInt(cur, 10) : 0) + 1;
    this.store.set(key, { value: String(next), expiresAt: Date.now() + 3600_000 });
    return next;
  }

  async expire(key: string, ttl: number): Promise<unknown> {
    const val = this.clean(key);
    if (val !== null) {
      this.store.set(key, { value: val, expiresAt: Date.now() + ttl * 1000 });
    }
    return 1;
  }
}

let _client: RedisLike | null = null;

export async function getRedis(): Promise<RedisLike> {
  if (_client) return _client;

  if (env.REDIS_URL) {
    try {
      const { default: Redis } = await import('ioredis');
      const client = new Redis(env.REDIS_URL);
      await client.ping();
      _client = client as unknown as RedisLike;
      logger.info('Redis connected');
      return _client;
    } catch (err) {
      logger.warn('Redis unavailable, using in-memory rate-limit store:', err);
    }
  }

  _client = new MemStore();
  return _client;
}
