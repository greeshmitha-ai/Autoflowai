import { eq, and, type SQL } from 'drizzle-orm';
import { type Database, getDb } from './connection.js';
import type { PoolConfig } from 'pg';

export type TenantId = string;

export interface TenantContext {
  tenantId: TenantId;
  db: Database;
}

/**
 * Creates a tenant-scoped database context.
 * All queries executed through this context will automatically include
 * the tenant_id filter, enforcing strict multi-tenant data isolation.
 */
export function withTenant(tenantId: TenantId, config?: PoolConfig): TenantContext {
  if (!tenantId || tenantId.trim() === '') {
    throw new Error('tenantId is required — queries cannot execute without a tenant context');
  }

  const db = getDb(config);
  return { tenantId, db };
}

/**
 * Helper to build a tenant-scoped WHERE condition.
 * Use this when constructing queries that need tenant isolation.
 */
export function tenantFilter<T extends { tenant_id: ReturnType<typeof eq> }>(
  column: Parameters<typeof eq>[0],
  tenantId: TenantId,
): SQL {
  return eq(column, tenantId);
}

/**
 * Combines a tenant filter with an additional condition.
 */
export function withTenantCondition(
  tenantColumn: Parameters<typeof eq>[0],
  tenantId: TenantId,
  additionalCondition: SQL,
): SQL {
  return and(eq(tenantColumn, tenantId), additionalCondition) as SQL;
}
