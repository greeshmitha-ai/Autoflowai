import { eq, and, gte, lte, isNull, sql } from 'drizzle-orm';
import { getDb, contacts } from '@platform/db';
import type { AudienceFilter, FieldFilter } from '@platform/db';

/**
 * Evaluates an audience filter against the contacts table and returns
 * the list of matching contact IDs (excluding unsubscribed contacts).
 */
export async function buildRecipientList(
  tenantId: string,
  filter: AudienceFilter,
  excludeContactIds: Set<string> = new Set(),
): Promise<string[]> {
  const db = getDb();

  // Base conditions: tenant scoped, not PII-erased
  const conditions = [
    eq(contacts.tenant_id, tenantId),
    isNull(contacts.pii_erasure_requested_at),
  ];

  // Lead score range filters
  if (filter.lead_score_min !== undefined) {
    conditions.push(gte(contacts.lead_score, filter.lead_score_min));
  }
  if (filter.lead_score_max !== undefined) {
    conditions.push(lte(contacts.lead_score, filter.lead_score_max));
  }

  // Lifecycle stage filter
  if (filter.lifecycle_stages && filter.lifecycle_stages.length > 0) {
    conditions.push(
      sql`${contacts.lifecycle_stage} = ANY(${filter.lifecycle_stages})`,
    );
  }

  const rows = await db
    .select({ contact_id: contacts.contact_id, tags: contacts.tags })
    .from(contacts)
    .where(and(...conditions));

  // Apply field filters and tag filters in memory
  let results = rows;

  if (filter.tags && filter.tags.length > 0) {
    const requiredTags = filter.tags;
    results = results.filter((c) => requiredTags.some((t) => c.tags.includes(t)));
  }

  if (filter.filters && filter.filters.length > 0) {
    results = applyFieldFilters(results, filter.filters, filter.logic ?? 'and');
  }

  return results
    .map((c) => c.contact_id)
    .filter((id) => !excludeContactIds.has(id));
}

function applyFieldFilters(
  rows: Array<{ contact_id: string; tags: string[] }>,
  filters: FieldFilter[],
  logic: 'and' | 'or',
): Array<{ contact_id: string; tags: string[] }> {
  return rows.filter((row) => {
    const results = filters.map((f) => evaluateFilter(row, f));
    return logic === 'and' ? results.every(Boolean) : results.some(Boolean);
  });
}

function evaluateFilter(
  row: Record<string, unknown>,
  filter: FieldFilter,
): boolean {
  const value = row[filter.field];
  if (value === undefined || value === null) return false;

  switch (filter.operator) {
    case 'eq':
      return String(value) === String(filter.value);
    case 'neq':
      return String(value) !== String(filter.value);
    case 'contains':
      return String(value).toLowerCase().includes(String(filter.value).toLowerCase());
    case 'gt':
      return Number(value) > Number(filter.value);
    case 'lt':
      return Number(value) < Number(filter.value);
    case 'gte':
      return Number(value) >= Number(filter.value);
    case 'lte':
      return Number(value) <= Number(filter.value);
    default:
      return false;
  }
}
