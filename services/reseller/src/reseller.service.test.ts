import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResellerService, NotFoundError, ValidationError } from './reseller.service.js';

// Mock @platform/db
vi.mock('@platform/db', () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    orderBy: vi.fn().mockResolvedValue([]),
    groupBy: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
  };

  return {
    getDb: vi.fn(() => mockDb),
    tenants: { tenant_id: 'tenant_id', parent_tenant_id: 'parent_tenant_id', status: 'status', domain: 'domain', created_at: 'created_at' },
    subscriptionPlans: {},
    usageRecords: { tenant_id: 'tenant_id', resource: 'resource', quantity: 'quantity' },
    eq: vi.fn((_col: unknown, _val: unknown) => ({ type: 'eq' })),
    and: vi.fn((..._args: unknown[]) => ({ type: 'and' })),
    sql: Object.assign(vi.fn(), { raw: vi.fn() }),
    count: vi.fn(() => ({ type: 'count' })),
  };
});

// Mock @platform/events
vi.mock('@platform/events', () => ({
  createPublisher: vi.fn().mockReturnValue({
    connect: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  }),
}));

async function getMockDb() {
  const { getDb } = await import('@platform/db');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getDb() as any;
}

// Re-establish the default mock chain after clearAllMocks
async function resetMockChain() {
  const db = await getMockDb();
  db.select.mockReturnThis();
  db.from.mockReturnThis();
  db.where.mockReturnThis();
  db.limit.mockResolvedValue([]);
  db.orderBy.mockResolvedValue([]);
  db.groupBy.mockResolvedValue([]);
  db.insert.mockReturnThis();
  db.values.mockReturnThis();
  db.returning.mockResolvedValue([]);
  db.update.mockReturnThis();
  db.set.mockReturnThis();
}

const mockReseller = {
  tenant_id: 'reseller-1',
  name: 'Acme Reseller',
  domain: 'acme.example.com',
  parent_tenant_id: null,
  branding: { logo_url: 'https://acme.com/logo.png', color_scheme: '#ff0000', product_name: 'Acme CRM' },
  plan_id: 'plan-1',
  status: 'active' as const,
  created_at: new Date(),
};

const mockSubTenant = {
  tenant_id: 'sub-1',
  name: 'Sub Corp',
  domain: 'sub.example.com',
  parent_tenant_id: 'reseller-1',
  branding: null,
  plan_id: 'plan-1',
  status: 'active' as const,
  created_at: new Date(),
};

describe('ResellerService', () => {
  let service: ResellerService;

  beforeEach(async () => {
    vi.clearAllMocks();
    await resetMockChain();
    service = new ResellerService(['localhost:9092']);
  });

  // ─── Sub-Tenant Provisioning ────────────────────────────────────────────────

  describe('createSubTenant', () => {
    it('throws NotFoundError when reseller does not exist', async () => {
      const db = await getMockDb();
      db.limit.mockResolvedValueOnce([]); // reseller not found

      await expect(
        service.createSubTenant('nonexistent', { name: 'Sub Corp' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('creates a sub-tenant under the reseller', async () => {
      const db = await getMockDb();
      db.limit.mockResolvedValueOnce([mockReseller]); // reseller found
      db.returning.mockResolvedValueOnce([mockSubTenant]);

      const result = await service.createSubTenant('reseller-1', {
        name: 'Sub Corp',
        domain: 'sub.example.com',
        plan_id: 'plan-1',
      });

      expect(result.tenant_id).toBe('sub-1');
      expect(result.parent_tenant_id).toBe('reseller-1');
    });
  });

  describe('deleteSubTenant', () => {
    it('throws NotFoundError when sub-tenant does not belong to reseller', async () => {
      const db = await getMockDb();
      db.limit.mockResolvedValueOnce([]); // sub-tenant not found

      await expect(
        service.deleteSubTenant('reseller-1', 'nonexistent'),
      ).rejects.toThrow(NotFoundError);
    });

    it('marks sub-tenant as deleted', async () => {
      const db = await getMockDb();
      db.limit.mockResolvedValueOnce([mockSubTenant]);

      await expect(
        service.deleteSubTenant('reseller-1', 'sub-1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('suspendSubTenant', () => {
    it('throws NotFoundError when sub-tenant not found', async () => {
      const db = await getMockDb();
      db.limit.mockResolvedValueOnce([]);

      await expect(
        service.suspendSubTenant('reseller-1', 'nonexistent'),
      ).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError when sub-tenant is already deleted', async () => {
      const db = await getMockDb();
      db.limit.mockResolvedValueOnce([{ ...mockSubTenant, status: 'deleted' }]);

      await expect(
        service.suspendSubTenant('reseller-1', 'sub-1'),
      ).rejects.toThrow(ValidationError);
    });

    it('suspends an active sub-tenant', async () => {
      const db = await getMockDb();
      db.limit.mockResolvedValueOnce([mockSubTenant]);

      await expect(
        service.suspendSubTenant('reseller-1', 'sub-1'),
      ).resolves.toBeUndefined();
    });
  });

  describe('listSubTenants', () => {
    it('returns empty array when no sub-tenants exist', async () => {
      const db = await getMockDb();
      db.orderBy.mockResolvedValueOnce([]);

      const result = await service.listSubTenants('reseller-1');
      expect(result).toEqual([]);
    });

    it('returns list of sub-tenants for the reseller', async () => {
      const db = await getMockDb();
      db.orderBy.mockResolvedValueOnce([mockSubTenant]);

      const result = await service.listSubTenants('reseller-1');
      expect(result).toHaveLength(1);
      expect(result[0]?.tenant_id).toBe('sub-1');
    });
  });

  // ─── Branding ───────────────────────────────────────────────────────────────

  describe('getBrandingByDomain', () => {
    it('returns null when domain not found', async () => {
      const db = await getMockDb();
      db.limit.mockResolvedValueOnce([]);

      const result = await service.getBrandingByDomain('unknown.example.com');
      expect(result).toBeNull();
    });

    it('returns branding config for a known domain', async () => {
      const db = await getMockDb();
      db.limit.mockResolvedValueOnce([{ branding: mockReseller.branding }]);

      const result = await service.getBrandingByDomain('acme.example.com');
      expect(result?.logo_url).toBe('https://acme.com/logo.png');
      expect(result?.product_name).toBe('Acme CRM');
    });
  });

  describe('updateBranding', () => {
    it('throws NotFoundError when tenant not found', async () => {
      const db = await getMockDb();
      // update().set().where().returning() — empty means not found
      db.returning.mockResolvedValueOnce([]);

      await expect(
        service.updateBranding('nonexistent', { logo_url: 'https://example.com/logo.png' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('updates branding for the reseller tenant', async () => {
      const db = await getMockDb();
      const newBranding = { logo_url: 'https://new.com/logo.png', product_name: 'New CRM' };
      db.returning.mockResolvedValueOnce([{ ...mockReseller, branding: newBranding }]);

      const result = await service.updateBranding('reseller-1', newBranding);
      expect(result.branding).toEqual(newBranding);
    });
  });

  // ─── Cascade Suspension ─────────────────────────────────────────────────────

  describe('cascadeSuspend', () => {
    it('returns empty array when no active sub-tenants', async () => {
      const db = await getMockDb();
      db.where.mockResolvedValueOnce([]); // no active sub-tenants

      const result = await service.cascadeSuspend('reseller-1');
      expect(result).toEqual([]);
    });

    it('suspends all active sub-tenants and publishes events', async () => {
      const db = await getMockDb();
      const { createPublisher } = await import('@platform/events');

      // First where() call returns active sub-tenants
      db.where.mockResolvedValueOnce([
        { tenant_id: 'sub-1' },
        { tenant_id: 'sub-2' },
      ]);
      // Second where() call is the bulk update (chained set().where())
      db.returning.mockResolvedValueOnce([]);

      const result = await service.cascadeSuspend('reseller-1');

      expect(result).toEqual(['sub-1', 'sub-2']);
      // Publisher called once per sub-tenant
      expect(createPublisher).toHaveBeenCalledTimes(2);
    });
  });

  // ─── Dashboard Metrics ──────────────────────────────────────────────────────

  describe('getDashboardMetrics', () => {
    it('returns zero metrics when no sub-tenants', async () => {
      const db = await getMockDb();
      // First query: status counts via groupBy
      db.groupBy.mockResolvedValueOnce([]);
      // Second query: sub-tenant IDs via orderBy
      db.orderBy.mockResolvedValueOnce([]);

      const metrics = await service.getDashboardMetrics('reseller-1');

      expect(metrics.total_sub_tenants).toBe(0);
      expect(metrics.active_sub_tenants).toBe(0);
      expect(metrics.aggregate_usage.contacts).toBe(0);
    });

    it('aggregates sub-tenant counts by status', async () => {
      const db = await getMockDb();

      // First query: status counts
      db.groupBy
        .mockResolvedValueOnce([
          { status: 'active', cnt: 3 },
          { status: 'suspended', cnt: 1 },
        ])
        // Third query: usage aggregation
        .mockResolvedValueOnce([
          { resource: 'contacts', total: 500 },
          { resource: 'sms_sent', total: 100 },
        ]);

      // Second query: sub-tenant IDs via orderBy
      db.orderBy.mockResolvedValueOnce([
        { tenant_id: 'sub-1' },
        { tenant_id: 'sub-2' },
        { tenant_id: 'sub-3' },
      ]);

      const metrics = await service.getDashboardMetrics('reseller-1');

      expect(metrics.total_sub_tenants).toBe(4); // 3 active + 1 suspended
      expect(metrics.active_sub_tenants).toBe(3);
      expect(metrics.suspended_sub_tenants).toBe(1);
      expect(metrics.aggregate_usage.contacts).toBe(500);
      expect(metrics.aggregate_usage.sms_sent).toBe(100);
    });
  });

  // ─── Sub-Tenant Data Isolation ──────────────────────────────────────────────

  describe('Sub-Tenant data isolation via withTenant()', () => {
    it('listSubTenants only returns sub-tenants belonging to the reseller', async () => {
      const db = await getMockDb();
      // Returns sub-tenants with parent_tenant_id = reseller-1
      db.orderBy.mockResolvedValueOnce([mockSubTenant]);

      const result = await service.listSubTenants('reseller-1');

      // All returned tenants should have the correct parent
      expect(result.every((t) => t.tenant_id === 'sub-1')).toBe(true);
    });

    it('deleteSubTenant rejects sub-tenants not owned by the reseller', async () => {
      const db = await getMockDb();
      // Simulate: sub-tenant exists but belongs to a different reseller
      db.limit.mockResolvedValueOnce([]); // ownership check fails

      await expect(
        service.deleteSubTenant('reseller-1', 'sub-owned-by-other'),
      ).rejects.toThrow(NotFoundError);
    });

    it('suspendSubTenant rejects sub-tenants not owned by the reseller', async () => {
      const db = await getMockDb();
      // Simulate: sub-tenant exists but belongs to a different reseller
      db.limit.mockResolvedValueOnce([]); // ownership check fails

      await expect(
        service.suspendSubTenant('reseller-1', 'sub-owned-by-other'),
      ).rejects.toThrow(NotFoundError);
    });
  });
});
