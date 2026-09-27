import { GlobalCache } from '@platform/cache';

const REFRESH_NAMESPACE = 'refresh_tokens';

export interface RefreshTokenData {
  user_id: string;
  tenant_id: string;
  roles: string[];
}

/**
 * Stores and validates refresh tokens in Redis.
 * Tokens are stored globally (not tenant-scoped) since the key is a random UUID.
 */
export class RefreshTokenStore {
  private readonly ttl: number;
  private readonly cache: GlobalCache;

  constructor(ttlSeconds: number) {
    this.ttl = ttlSeconds;
    this.cache = new GlobalCache(REFRESH_NAMESPACE);
  }

  async save(token: string, data: RefreshTokenData): Promise<void> {
    await this.cache.set(token, data, { ttl: this.ttl });
  }

  async get(token: string): Promise<RefreshTokenData | null> {
    return this.cache.get<RefreshTokenData>(token);
  }

  async delete(token: string): Promise<void> {
    await this.cache.del(token);
  }
}
