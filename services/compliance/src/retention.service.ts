import { eq, and, lt } from 'drizzle-orm';
import { getDb, retentionPolicies, contacts, auditLogs } from '@platform/db';
import type { RetentionPolicy } from '@platform/db';

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export async function setRetentionPolicy(
  tenantId: string,
  resourceType: string,
  retentionDays: number,
): Promise<RetentionPolicy> {
  if (!resourceType?.trim()) throw new ValidationError('resource_type is required');
  if (!Number.isInteger(retentionDays) || retentionDays <= 0) {
    throw new ValidationError('retention_days must be a positive integer');
  }

  const db = getDb();

  // Upsert: update if exists, insert if not
  const existing = await db
    .select()
    .from(retentionPolicies)
    .where(
      and(
        eq(retentionPolicies.tenant_id, tenantId),
        eq(retentionPolicies.resource_type, resourceType),
      ),
    );

  if (existing.length > 0 && existing[0]) {
    const [updated] = await db
      .update(retentionPolicies)
      .set({ retention_days: retentionDays })
      .where(eq(retentionPolicies.policy_id, existing[0].policy_id))
      .returning();
    if (!updated) throw new Error('Failed to update retention policy');
    return updated;
  }

  const [policy] = await db
    .insert(retentionPolicies)
    .values({ tenant_id: tenantId, resource_type: resourceType, retention_days: retentionDays })
    .returning();
  if (!policy) throw new Error('Failed to create retention policy');
  return policy;
}

export async function listRetentionPolicies(tenantId: string): Promise<RetentionPolicy[]> {
  const db = getDb();
  return db
    .select()
    .from(retentionPolicies)
    .where(eq(retentionPolicies.tenant_id, tenantId));
}

/**
 * Purge records for a specific tenant + resource type older than the configured retention period.
 * Returns the number of records deleted.
 */
export async function purgeByRetentionPolicy(policy: RetentionPolicy): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - policy.retention_days);

  const db = getDb();

  switch (policy.resource_type) {
    case 'contacts': {
      const deleted = await db
        .delete(contacts)
        .where(
          and(
            eq(contacts.tenant_id, policy.tenant_id),
            lt(contacts.created_at, cutoff),
          ),
        )
        .returning({ contact_id: contacts.contact_id });
      return deleted.length;
    }
    case 'audit_logs': {
      const deleted = await db
        .delete(auditLogs)
        .where(
          and(
            eq(auditLogs.tenant_id, policy.tenant_id),
            lt(auditLogs.timestamp, cutoff),
          ),
        )
        .returning({ audit_id: auditLogs.audit_id });
      return deleted.length;
    }
    default:
      // Unknown resource type — log and skip
      console.warn(`[retention] Unknown resource_type: ${policy.resource_type}`);
      return 0;
  }
}

/**
 * Run retention purge across all configured policies.
 */
export async function runRetentionPurge(): Promise<void> {
  const db = getDb();
  const policies = await db.select().from(retentionPolicies);

  for (const policy of policies) {
    try {
      const deleted = await purgeByRetentionPolicy(policy);
      if (deleted > 0) {
        console.log(
          `[retention] Purged ${deleted} ${policy.resource_type} records for tenant ${policy.tenant_id}`,
        );
      }
    } catch (err) {
      console.error(`[retention] Failed to purge policy ${policy.policy_id}:`, err);
    }
  }
}
