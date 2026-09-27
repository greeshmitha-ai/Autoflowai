import { getRedisClient } from './client.js';

export interface CacheOptions {
  /** TTL in seconds */
  ttl?: number;
}

/**
 * Typed cache utilities with tenant-namespaced keys.
 * All keys are automatically prefixed with the tenant_id to prevent cross-tenant data leakage.
 */
export class TenantCache {
  private tenantId: string;
  private prefix: string;

  constructor(tenantId: string, namespace?: string) {
    if (!tenantId) throw new Error('tenantId is required for TenantCache');
    this.tenantId = tenantId;
    this.prefix = namespace ? `t:${tenantId}:${namespace}` : `t:${tenantId}`;
  }

  private buildKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  /**
   * Get a typed value from cache.
   * Returns null if the key does not exist or has expired.
   */
  async get<T>(key: string): Promise<T | null> {
    const redis = getRedisClient();
    const raw = await redis.get(this.buildKey(key));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  /**
   * Set a typed value in cache with optional TTL.
   */
  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const redis = getRedisClient();
    const serialized = JSON.stringify(value);
    const fullKey = this.buildKey(key);

    if (options?.ttl !== undefined && options.ttl > 0) {
      await redis.setex(fullKey, options.ttl, serialized);
    } else {
      await redis.set(fullKey, serialized);
    }
  }

  /**
   * Delete a key from cache.
   */
  async del(key: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(this.buildKey(key));
  }

  /**
   * Delete multiple keys matching a pattern within this tenant's namespace.
   */
  async delPattern(pattern: string): Promise<void> {
    const redis = getRedisClient();
    const fullPattern = this.buildKey(pattern);
    const keys = await redis.keys(fullPattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  }

  /**
   * Check if a key exists.
   */
  async exists(key: string): Promise<boolean> {
    const redis = getRedisClient();
    const count = await redis.exists(this.buildKey(key));
    return count > 0;
  }

  /**
   * Get remaining TTL in seconds. Returns -1 if no TTL, -2 if key doesn't exist.
   */
  async ttl(key: string): Promise<number> {
    const redis = getRedisClient();
    return redis.ttl(this.buildKey(key));
  }

  /**
   * Increment a numeric counter.
   */
  async incr(key: string): Promise<number> {
    const redis = getRedisClient();
    return redis.incr(this.buildKey(key));
  }

  /**
   * Increment with expiry — useful for rate limiting and lockout counters.
   */
  async incrWithTtl(key: string, ttlSeconds: number): Promise<number> {
    const redis = getRedisClient();
    const fullKey = this.buildKey(key);
    const pipeline = redis.pipeline();
    pipeline.incr(fullKey);
    pipeline.expire(fullKey, ttlSeconds);
    const results = await pipeline.exec();
    const incrResult = results?.[0];
    if (!incrResult || incrResult[0]) {
      throw new Error('Redis pipeline error during incrWithTtl');
    }
    return incrResult[1] as number;
  }

  /**
   * Set a key only if it does not already exist (NX flag).
   * Returns true if the key was set, false if it already existed.
   */
  async setNx<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    const redis = getRedisClient();
    const fullKey = this.buildKey(key);
    const serialized = JSON.stringify(value);

    if (ttlSeconds !== undefined) {
      const result = await redis.set(fullKey, serialized, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    }

    const result = await redis.setnx(fullKey, serialized);
    return result === 1;
  }
}

/**
 * Global (non-tenant-scoped) cache for shared data like public configs.
 */
export class GlobalCache {
  private prefix: string;

  constructor(namespace?: string) {
    this.prefix = namespace ? `global:${namespace}` : 'global';
  }

  private buildKey(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async get<T>(key: string): Promise<T | null> {
    const redis = getRedisClient();
    const raw = await redis.get(this.buildKey(key));
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    const redis = getRedisClient();
    const serialized = JSON.stringify(value);
    const fullKey = this.buildKey(key);

    if (options?.ttl !== undefined && options.ttl > 0) {
      await redis.setex(fullKey, options.ttl, serialized);
    } else {
      await redis.set(fullKey, serialized);
    }
  }

  async del(key: string): Promise<void> {
    const redis = getRedisClient();
    await redis.del(this.buildKey(key));
  }
}
