import { TenantCache } from '@platform/cache';

const FAILED_ATTEMPTS_NAMESPACE = 'auth:failed';
const LOCKOUT_NAMESPACE = 'auth:lockout';

/**
 * Track failed login attempts and enforce account lockout.
 * Keys are scoped per (tenant_id, email) via TenantCache namespacing.
 */
export class LockoutService {
  private readonly maxAttempts: number;
  private readonly lockoutTtl: number;

  constructor(maxAttempts: number, lockoutTtl: number) {
    this.maxAttempts = maxAttempts;
    this.lockoutTtl = lockoutTtl;
  }

  private failedCache(tenantId: string): TenantCache {
    return new TenantCache(tenantId, FAILED_ATTEMPTS_NAMESPACE);
  }

  private lockoutCache(tenantId: string): TenantCache {
    return new TenantCache(tenantId, LOCKOUT_NAMESPACE);
  }

  /**
   * Check if the account is currently locked out.
   */
  async isLockedOut(tenantId: string, email: string): Promise<boolean> {
    const cache = this.lockoutCache(tenantId);
    return cache.exists(email.toLowerCase());
  }

  /**
   * Record a failed login attempt.
   * On reaching maxAttempts, sets a lockout key with lockoutTtl.
   * Returns the current attempt count.
   */
  async recordFailedAttempt(tenantId: string, email: string): Promise<number> {
    const key = email.toLowerCase();
    const failedCache = this.failedCache(tenantId);

    // Increment counter; set TTL equal to lockout window on first increment
    const count = await failedCache.incrWithTtl(key, this.lockoutTtl);

    if (count >= this.maxAttempts) {
      // Set explicit lockout key
      const lockoutCache = this.lockoutCache(tenantId);
      await lockoutCache.set(key, true, { ttl: this.lockoutTtl });
    }

    return count;
  }

  /**
   * Clear failed attempt counter and lockout on successful login.
   */
  async clearAttempts(tenantId: string, email: string): Promise<void> {
    const key = email.toLowerCase();
    await this.failedCache(tenantId).del(key);
    await this.lockoutCache(tenantId).del(key);
  }
}
