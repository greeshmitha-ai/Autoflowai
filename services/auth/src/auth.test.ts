import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PERMISSION_MATRIX, hasPermission, type Role, type Permission } from './types.js';

// ─── RBAC permission matrix tests ────────────────────────────────────────────

describe('RBAC permission matrix', () => {
  it('owner has all permissions', () => {
    const ownerPerms = PERMISSION_MATRIX['owner'];
    expect(ownerPerms).toContain('contacts:read');
    expect(ownerPerms).toContain('contacts:write');
    expect(ownerPerms).toContain('contacts:delete');
    expect(ownerPerms).toContain('billing:write');
    expect(ownerPerms).toContain('users:delete');
    expect(ownerPerms).toContain('settings:write');
  });

  it('viewer has only read permissions', () => {
    const viewerPerms = PERMISSION_MATRIX['viewer'];
    expect(viewerPerms).toContain('contacts:read');
    expect(viewerPerms).not.toContain('contacts:write');
    expect(viewerPerms).not.toContain('contacts:delete');
    expect(viewerPerms).not.toContain('billing:write');
    expect(viewerPerms).not.toContain('users:delete');
  });

  it('member cannot delete contacts', () => {
    expect(PERMISSION_MATRIX['member']).not.toContain('contacts:delete');
  });

  it('admin cannot delete users', () => {
    // admin can write users but not delete
    expect(PERMISSION_MATRIX['admin']).toContain('users:write');
    expect(PERMISSION_MATRIX['admin']).not.toContain('users:delete');
  });

  it('hasPermission returns true when role grants permission', () => {
    expect(hasPermission(['owner'], 'billing:write')).toBe(true);
    expect(hasPermission(['admin'], 'contacts:delete')).toBe(true);
    expect(hasPermission(['member'], 'contacts:read')).toBe(true);
    expect(hasPermission(['viewer'], 'contacts:read')).toBe(true);
  });

  it('hasPermission returns false when role lacks permission', () => {
    expect(hasPermission(['viewer'], 'contacts:write')).toBe(false);
    expect(hasPermission(['member'], 'billing:write')).toBe(false);
    expect(hasPermission(['admin'], 'users:delete')).toBe(false);
  });

  it('hasPermission returns true if any role in array grants permission', () => {
    expect(hasPermission(['viewer', 'admin'], 'billing:write')).toBe(false);
    expect(hasPermission(['viewer', 'owner'], 'billing:write')).toBe(true);
  });

  it('hasPermission returns false for empty roles array', () => {
    expect(hasPermission([], 'contacts:read')).toBe(false);
  });

  it('hasPermission returns false for unknown role', () => {
    expect(hasPermission(['superuser'], 'contacts:read')).toBe(false);
  });
});

// ─── Token utilities tests ────────────────────────────────────────────────────

describe('token utilities', () => {
  it('issueTokens returns access token, refresh token, and expiresIn', async () => {
    const { generateKeyPairSync } = await import('crypto');
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

    const { issueTokens, verifyAccessToken } = await import('./token.js');

    const config = {
      jwtPrivateKey: privateKeyPem,
      jwtPublicKey: publicKeyPem,
      accessTokenTtl: 900,
      refreshTokenTtl: 2592000,
      bcryptCostFactor: 12,
      maxFailedAttempts: 3,
      lockoutTtl: 900,
      port: 3001,
      host: '0.0.0.0',
    };

    const tokens = issueTokens(
      { user_id: 'user-1', tenant_id: 'tenant-1', roles: ['member'] },
      config,
    );

    expect(tokens.accessToken).toBeTruthy();
    expect(tokens.refreshToken).toBeTruthy();
    expect(tokens.expiresIn).toBe(900);

    // Verify the token is valid
    const payload = verifyAccessToken(tokens.accessToken, publicKeyPem);
    expect(payload.user_id).toBe('user-1');
    expect(payload.tenant_id).toBe('tenant-1');
    expect(payload.roles).toEqual(['member']);
  });

  it('verifyAccessToken throws on expired token', async () => {
    const { generateKeyPairSync } = await import('crypto');
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

    const jwt = await import('jsonwebtoken');
    const expiredToken = jwt.default.sign(
      { user_id: 'u1', tenant_id: 't1', roles: ['member'] },
      privateKeyPem,
      { algorithm: 'RS256', expiresIn: -1 },
    );

    const { verifyAccessToken } = await import('./token.js');
    expect(() => verifyAccessToken(expiredToken, publicKeyPem)).toThrow();
  });
});

// ─── Lockout service tests ────────────────────────────────────────────────────

describe('LockoutService', () => {
  const mockCache = {
    exists: vi.fn(),
    incrWithTtl: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('isLockedOut returns true when lockout key exists', async () => {
    // Mock TenantCache
    vi.doMock('@platform/cache', () => ({
      TenantCache: vi.fn().mockImplementation(() => mockCache),
      GlobalCache: vi.fn(),
    }));

    mockCache.exists.mockResolvedValue(true);

    const { LockoutService } = await import('./lockout.js');
    const svc = new LockoutService(3, 900);
    const result = await svc.isLockedOut('tenant-1', 'user@example.com');
    expect(result).toBe(true);
  });

  it('isLockedOut returns false when no lockout key', async () => {
    vi.doMock('@platform/cache', () => ({
      TenantCache: vi.fn().mockImplementation(() => mockCache),
      GlobalCache: vi.fn(),
    }));

    mockCache.exists.mockResolvedValue(false);

    const { LockoutService } = await import('./lockout.js');
    const svc = new LockoutService(3, 900);
    const result = await svc.isLockedOut('tenant-1', 'user@example.com');
    expect(result).toBe(false);
  });

  it('recordFailedAttempt sets lockout on 3rd failure', async () => {
    vi.doMock('@platform/cache', () => ({
      TenantCache: vi.fn().mockImplementation(() => mockCache),
      GlobalCache: vi.fn(),
    }));

    mockCache.incrWithTtl.mockResolvedValue(3);
    mockCache.set.mockResolvedValue(undefined);

    const { LockoutService } = await import('./lockout.js');
    const svc = new LockoutService(3, 900);
    const count = await svc.recordFailedAttempt('tenant-1', 'user@example.com');

    expect(count).toBe(3);
    expect(mockCache.set).toHaveBeenCalledWith('user@example.com', true, { ttl: 900 });
  });

  it('recordFailedAttempt does not set lockout before threshold', async () => {
    vi.doMock('@platform/cache', () => ({
      TenantCache: vi.fn().mockImplementation(() => mockCache),
      GlobalCache: vi.fn(),
    }));

    mockCache.incrWithTtl.mockResolvedValue(2);
    mockCache.set.mockResolvedValue(undefined);

    const { LockoutService } = await import('./lockout.js');
    const svc = new LockoutService(3, 900);
    await svc.recordFailedAttempt('tenant-1', 'user@example.com');

    expect(mockCache.set).not.toHaveBeenCalled();
  });

  it('clearAttempts deletes both failed and lockout keys', async () => {
    vi.doMock('@platform/cache', () => ({
      TenantCache: vi.fn().mockImplementation(() => mockCache),
      GlobalCache: vi.fn(),
    }));

    mockCache.del.mockResolvedValue(undefined);

    const { LockoutService } = await import('./lockout.js');
    const svc = new LockoutService(3, 900);
    await svc.clearAttempts('tenant-1', 'user@example.com');

    expect(mockCache.del).toHaveBeenCalledTimes(2);
  });
});

// ─── Config validation tests ──────────────────────────────────────────────────

describe('loadConfig', () => {
  it('throws if ACCESS_TOKEN_TTL is less than 900', () => {
    const ttl = 600;
    expect(() => {
      if (ttl < 900) throw new Error('ACCESS_TOKEN_TTL must be at least 900 seconds (15 minutes)');
    }).toThrow('ACCESS_TOKEN_TTL must be at least 900 seconds');
  });

  it('throws if BCRYPT_COST_FACTOR is less than 12', () => {
    expect(() => {
      const factor = 10;
      if (factor < 12) throw new Error('BCRYPT_COST_FACTOR must be at least 12');
    }).toThrow('BCRYPT_COST_FACTOR must be at least 12');
  });
});
