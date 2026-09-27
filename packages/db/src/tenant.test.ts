import { describe, it, expect } from 'vitest';
import { withTenant, tenantFilter, withTenantCondition } from './tenant.js';

// Mock the connection module to avoid needing a real DB
import { vi } from 'vitest';

vi.mock('./connection.js', () => ({
  getDb: vi.fn().mockReturnValue({ /* mock db */ }),
}));

describe('withTenant', () => {
  it('creates a tenant context with the given tenantId', () => {
    const ctx = withTenant('tenant-abc');
    expect(ctx.tenantId).toBe('tenant-abc');
    expect(ctx.db).toBeDefined();
  });

  it('throws when tenantId is empty string', () => {
    expect(() => withTenant('')).toThrow('tenantId is required');
  });

  it('throws when tenantId is whitespace only', () => {
    expect(() => withTenant('   ')).toThrow('tenantId is required');
  });

  it('throws when tenantId is missing', () => {
    // @ts-expect-error testing runtime guard
    expect(() => withTenant(undefined)).toThrow('tenantId is required');
  });

  it('accepts valid UUID tenantId', () => {
    const uuid = '550e8400-e29b-41d4-a716-446655440000';
    const ctx = withTenant(uuid);
    expect(ctx.tenantId).toBe(uuid);
  });
});
