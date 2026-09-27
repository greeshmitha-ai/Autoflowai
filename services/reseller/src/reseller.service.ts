import { eq, and, sql, count } from 'drizzle-orm';
import {
  getDb,
  tenants,
  subscriptionPlans,
  subscriptions,
  usageRecords,
  type Tenant,
  type NewTenant,
} from '@platform/db';
import { createPublisher } from '@platform/events';

export interface BrandingConfig {
  logo_url?: string;
  color_scheme?: string;
  product_name?: string;
}

export interface CreateSubTenantBody {
  name: string;
  domain?: string;
  plan_id?: string;
  branding?: BrandingConfig;
}

export interface SubTenantSummary {
  tenant_id: string;
  name: string;
  domain: string | null;
  status: 'active' | 'suspended' | 'deleted';
  plan_id: string | null;
  branding: BrandingConfig | null;
  created_at: Date;
}

export interface DashboardMetrics {
  total_sub_tenants: number;
  active_sub_tenants: number;
  suspended_sub_tenants: number;
  aggregate_usage: {
    contacts: number;
    call_minutes: number;
    sms_sent: number;
    ai_tokens: number;
  };
}

export interface CreatePlanBody {
  name: string;
  tier: 'starter' | 'growth' | 'enterprise';
  features?: Record<string, unknown>;
  limits?: {
    contacts?: number;
    call_minutes?: number;
    sms_sent?: number;
    ai_tokens?: number;
  };
  stripe_price_id: string;
}

export class ResellerService {
  private kafkaBrokers: string[];

  constructor(kafkaBrokers: string[]) {
    this.kafkaBrokers = kafkaBrokers;
  }

  // ─── Sub-Tenant Provisioning ──────────────────────────────────────────────────

  async createSubTenant(
    resellerTenantId: string,
    body: CreateSubTenantBody,
  ): Promise<Tenant> {
    const db = getDb();

    // Verify the reseller tenant exists and is active
    const [reseller] = await db
      .select()
      .from(tenants)
      .where(and(eq(tenants.tenant_id, resellerTenantId), eq(tenants.status, 'active')))
      .limit(1);

    if (!reseller) throw new NotFoundError('Reseller tenant not found or not active');

    const [subTenant] = await db
      .insert(tenants)
      .values({
        name: body.name,
        domain: body.domain ?? null,
        parent_tenant_id: resellerTenantId,
        plan_id: body.plan_id ?? null,
        branding: body.branding ?? null,
        status: 'active',
      } as NewTenant)
      .returning();

    if (!subTenant) throw new Error('Failed to create sub-tenant');

    return subTenant;
  }

  async deleteSubTenant(resellerTenantId: string, subTenantId: string): Promise<void> {
    const db = getDb();

    const [subTenant] = await db
      .select()
      .from(tenants)
      .where(
        and(
          eq(tenants.tenant_id, subTenantId),
          eq(tenants.parent_tenant_id, resellerTenantId),
        ),
      )
      .limit(1);

    if (!subTenant) throw new NotFoundError('Sub-tenant not found');

    await db
      .update(tenants)
      .set({ status: 'deleted' })
      .where(eq(tenants.tenant_id, subTenantId));
  }

  async suspendSubTenant(resellerTenantId: string, subTenantId: string): Promise<void> {
    const db = getDb();

    const [subTenant] = await db
      .select()
      .from(tenants)
      .where(
        and(
          eq(tenants.tenant_id, subTenantId),
          eq(tenants.parent_tenant_id, resellerTenantId),
        ),
      )
      .limit(1);

    if (!subTenant) throw new NotFoundError('Sub-tenant not found');
    if (subTenant.status === 'deleted') throw new ValidationError('Cannot suspend a deleted sub-tenant');

    await db
      .update(tenants)
      .set({ status: 'suspended' })
      .where(eq(tenants.tenant_id, subTenantId));
  }

  async listSubTenants(resellerTenantId: string): Promise<SubTenantSummary[]> {
    const db = getDb();

    const rows = await db
      .select()
      .from(tenants)
      .where(
        and(
          eq(tenants.parent_tenant_id, resellerTenantId),
          sql`${tenants.status} != 'deleted'`,
        ),
      )
      .orderBy(tenants.created_at);

    return rows.map((t) => ({
      tenant_id: t.tenant_id,
      name: t.name,
      domain: t.domain ?? null,
      status: t.status,
      plan_id: t.plan_id ?? null,
      branding: (t.branding as BrandingConfig | null) ?? null,
      created_at: t.created_at,
    }));
  }

  // ─── Branding ─────────────────────────────────────────────────────────────────

  async getBrandingByDomain(domain: string): Promise<BrandingConfig | null> {
    const db = getDb();

    const [tenant] = await db
      .select({ branding: tenants.branding })
      .from(tenants)
      .where(and(eq(tenants.domain, domain), eq(tenants.status, 'active')))
      .limit(1);

    if (!tenant) return null;
    return (tenant.branding as BrandingConfig | null) ?? null;
  }

  async updateBranding(resellerTenantId: string, branding: BrandingConfig): Promise<Tenant> {
    const db = getDb();

    const [updated] = await db
      .update(tenants)
      .set({ branding })
      .where(eq(tenants.tenant_id, resellerTenantId))
      .returning();

    if (!updated) throw new NotFoundError('Reseller tenant not found');
    return updated;
  }

  // ─── Custom Pricing Plans ─────────────────────────────────────────────────────

  async createPlan(resellerTenantId: string, body: CreatePlanBody) {
    const db = getDb();

    const [plan] = await db
      .insert(subscriptionPlans)
      .values({
        name: body.name,
        tier: body.tier,
        features: { ...body.features, reseller_tenant_id: resellerTenantId },
        limits: body.limits ?? {},
        stripe_price_id: body.stripe_price_id,
      })
      .returning();

    if (!plan) throw new Error('Failed to create plan');
    return plan;
  }

  // ─── Cascade Suspension ───────────────────────────────────────────────────────

  /**
   * When a Reseller's subscription is suspended, cascade suspend all active Sub_Tenants
   * and publish a notification event for each suspended Sub_Tenant owner.
   */
  async cascadeSuspend(resellerTenantId: string): Promise<string[]> {
    const db = getDb();

    // Find all active sub-tenants
    const activeSubTenants = await db
      .select({ tenant_id: tenants.tenant_id })
      .from(tenants)
      .where(
        and(
          eq(tenants.parent_tenant_id, resellerTenantId),
          eq(tenants.status, 'active'),
        ),
      );

    if (activeSubTenants.length === 0) return [];

    const subTenantIds = activeSubTenants.map((t) => t.tenant_id);

    // Suspend all active sub-tenants in bulk
    await db
      .update(tenants)
      .set({ status: 'suspended' })
      .where(
        and(
          eq(tenants.parent_tenant_id, resellerTenantId),
          eq(tenants.status, 'active'),
        ),
      );

    // Publish notification event for each suspended sub-tenant
    for (const subTenantId of subTenantIds) {
      await this.publishResellerEvent(subTenantId, 'reseller.sub_tenant.suspended', {
        sub_tenant_id: subTenantId,
        reseller_tenant_id: resellerTenantId,
        reason: 'reseller_suspended',
      });
    }

    return subTenantIds;
  }

  // ─── Dashboard Metrics ────────────────────────────────────────────────────────

  async getDashboardMetrics(resellerTenantId: string): Promise<DashboardMetrics> {
    const db = getDb();

    // Count sub-tenants by status
    const statusCounts = await db
      .select({
        status: tenants.status,
        cnt: count(tenants.tenant_id),
      })
      .from(tenants)
      .where(eq(tenants.parent_tenant_id, resellerTenantId))
      .groupBy(tenants.status);

    let totalSubTenants = 0;
    let activeSubTenants = 0;
    let suspendedSubTenants = 0;

    for (const row of statusCounts) {
      const n = Number(row.cnt);
      if (row.status !== 'deleted') totalSubTenants += n;
      if (row.status === 'active') activeSubTenants = n;
      if (row.status === 'suspended') suspendedSubTenants = n;
    }

    // Get all non-deleted sub-tenant IDs for usage aggregation
    const subTenantRows = await db
      .select({ tenant_id: tenants.tenant_id })
      .from(tenants)
      .where(
        and(
          eq(tenants.parent_tenant_id, resellerTenantId),
          sql`${tenants.status} != 'deleted'`,
        ),
      )
      .orderBy(tenants.created_at);

    const subTenantIds = subTenantRows.map((r) => r.tenant_id);

    // Aggregate usage across all sub-tenants
    const aggregateUsage = {
      contacts: 0,
      call_minutes: 0,
      sms_sent: 0,
      ai_tokens: 0,
    };

    if (subTenantIds.length > 0) {
      const usageRows = await db
        .select({
          resource: usageRecords.resource,
          total: sql<number>`sum(${usageRecords.quantity})::int`,
        })
        .from(usageRecords)
        .where(sql`${usageRecords.tenant_id} = ANY(${sql.raw(`ARRAY[${subTenantIds.map((id) => `'${id}'`).join(',')}]::uuid[]`)})`)
        .groupBy(usageRecords.resource);

      for (const row of usageRows) {
        const resource = row.resource as keyof typeof aggregateUsage;
        if (resource in aggregateUsage) {
          aggregateUsage[resource] = row.total ?? 0;
        }
      }
    }

    return {
      total_sub_tenants: totalSubTenants,
      active_sub_tenants: activeSubTenants,
      suspended_sub_tenants: suspendedSubTenants,
      aggregate_usage: aggregateUsage,
    };
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  private async publishResellerEvent(
    tenantId: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const publisher = createPublisher(tenantId, { brokers: this.kafkaBrokers });
      await publisher.connect();
      await publisher.publish('reseller', type as never, payload as never);
      await publisher.disconnect();
    } catch (err) {
      console.error(`Failed to publish reseller event ${type}:`, err);
    }
  }
}

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
