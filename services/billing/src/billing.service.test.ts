import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BillingService, NotFoundError, ValidationError } from './billing.service.js';

// Mock @platform/db
vi.mock('@platform/db', () => {
  const mockDb = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
    orderBy: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockResolvedValue([]),
  };

  return {
    getDb: vi.fn(() => mockDb),
    subscriptionPlans: {},
    subscriptions: {},
    invoices: {},
    usageRecords: {},
    eq: vi.fn(),
    and: vi.fn(),
    sql: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
  };
});

// Mock @platform/cache
vi.mock('@platform/cache', () => ({
  TenantCache: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock @platform/events
vi.mock('@platform/events', () => ({
  createPublisher: vi.fn().mockReturnValue({
    connect: vi.fn().mockResolvedValue(undefined),
    publish: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock stripe
vi.mock('stripe', () => {
  const mockStripeInstance = {
    customers: {
      create: vi.fn().mockResolvedValue({ id: 'cus_test123' }),
      update: vi.fn().mockResolvedValue({}),
    },
    subscriptions: {
      create: vi.fn().mockResolvedValue({
        id: 'sub_test123',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
        items: { data: [{ id: 'si_test123' }] },
      }),
      retrieve: vi.fn().mockResolvedValue({
        id: 'sub_test123',
        items: { data: [{ id: 'si_test123' }] },
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      }),
      update: vi.fn().mockResolvedValue({
        id: 'sub_test123',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
      }),
    },
    paymentMethods: {
      attach: vi.fn().mockResolvedValue({}),
    },
    invoices: {
      list: vi.fn().mockResolvedValue({ data: [] }),
      pay: vi.fn().mockResolvedValue({}),
      retrieve: vi.fn().mockResolvedValue({ invoice_pdf: 'https://stripe.com/invoice.pdf' }),
      retrieveUpcoming: vi.fn().mockResolvedValue({ amount_due: 1000 }),
    },
    webhooks: {
      constructEvent: vi.fn().mockImplementation(() => {
        throw new Error('Invalid signature');
      }),
    },
  };

  return {
    default: vi.fn().mockImplementation(() => mockStripeInstance),
  };
});

// Helper to get the mock db
async function getMockDb() {
  const { getDb } = await import('@platform/db');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return getDb() as any;
}

describe('BillingService', () => {
  let service: BillingService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BillingService('sk_test_fake', ['localhost:9092']);
  });

  describe('subscribe', () => {
    it('throws NotFoundError when plan does not exist', async () => {
      const db = await getMockDb();
      db.limit.mockResolvedValueOnce([]);

      await expect(
        service.subscribe('tenant-1', { plan_id: 'nonexistent-plan' }),
      ).rejects.toThrow(NotFoundError);
    });

    it('creates a new subscription when no existing subscription', async () => {
      const db = await getMockDb();

      const mockPlan = {
        plan_id: 'plan-1',
        name: 'Starter',
        tier: 'starter',
        features: {},
        limits: { contacts: 1000 },
        stripe_price_id: 'price_test123',
        created_at: new Date(),
      };

      const mockSubscription = {
        subscription_id: 'sub-db-1',
        tenant_id: 'tenant-1',
        plan_id: 'plan-1',
        stripe_customer_id: 'cus_test123',
        stripe_subscription_id: 'sub_test123',
        status: 'active',
        current_period_start: new Date(),
        current_period_end: new Date(),
        created_at: new Date(),
      };

      db.limit
        .mockResolvedValueOnce([mockPlan])  // plan lookup
        .mockResolvedValueOnce([]);          // existing subscription lookup

      db.returning.mockResolvedValueOnce([mockSubscription]);

      const result = await service.subscribe('tenant-1', { plan_id: 'plan-1' });

      expect(result.subscription.stripe_customer_id).toBe('cus_test123');
      expect(result.subscription.stripe_subscription_id).toBe('sub_test123');
      expect(result.plan.plan_id).toBe('plan-1');
    });
  });

  describe('getUsage', () => {
    it('returns zero usage when no records exist', async () => {
      const db = await getMockDb();

      db.limit.mockResolvedValueOnce([]); // no active subscription
      db.groupBy.mockResolvedValueOnce([]); // no usage records

      const usage = await service.getUsage('tenant-1');

      expect(usage.contacts).toBe(0);
      expect(usage.call_minutes).toBe(0);
      expect(usage.sms_sent).toBe(0);
      expect(usage.ai_tokens).toBe(0);
    });

    it('aggregates usage by resource type', async () => {
      const db = await getMockDb();

      const mockSub = {
        current_period_start: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        current_period_end: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        plan_id: 'plan-1',
      };

      db.limit
        .mockResolvedValueOnce([mockSub])                          // subscription lookup
        .mockResolvedValueOnce([{ limits: { contacts: 1000 } }]); // plan limits

      db.groupBy.mockResolvedValueOnce([
        { resource: 'contacts', total: 250 },
        { resource: 'sms_sent', total: 50 },
      ]);

      const usage = await service.getUsage('tenant-1');

      expect(usage.contacts).toBe(250);
      expect(usage.sms_sent).toBe(50);
      expect(usage.call_minutes).toBe(0);
      expect(usage.limits).toEqual({ contacts: 1000 });
    });
  });

  describe('listInvoices', () => {
    it('returns invoices for tenant', async () => {
      const db = await getMockDb();

      const mockInvoices = [
        {
          invoice_id: 'inv-1',
          tenant_id: 'tenant-1',
          stripe_invoice_id: 'in_test1',
          amount_cents: 9900,
          currency: 'usd',
          status: 'paid',
          pdf_url: 'https://stripe.com/inv1.pdf',
          period_start: new Date(),
          period_end: new Date(),
          created_at: new Date(),
        },
      ];

      db.limit.mockResolvedValueOnce(mockInvoices);

      const result = await service.listInvoices('tenant-1');
      expect(result).toHaveLength(1);
      expect(result[0]?.amount_cents).toBe(9900);
    });
  });

  describe('getInvoicePdfUrl', () => {
    it('throws NotFoundError when invoice does not exist', async () => {
      const db = await getMockDb();
      db.limit.mockResolvedValueOnce([]);

      await expect(
        service.getInvoicePdfUrl('tenant-1', 'nonexistent-invoice'),
      ).rejects.toThrow(NotFoundError);
    });

    it('returns stored pdf_url when available', async () => {
      const db = await getMockDb();

      const mockInvoice = {
        invoice_id: 'inv-1',
        tenant_id: 'tenant-1',
        stripe_invoice_id: 'in_test1',
        amount_cents: 9900,
        currency: 'usd',
        status: 'paid',
        pdf_url: 'https://s3.amazonaws.com/invoice.pdf',
        period_start: new Date(),
        period_end: new Date(),
        created_at: new Date(),
      };

      db.limit.mockResolvedValueOnce([mockInvoice]);

      const url = await service.getInvoicePdfUrl('tenant-1', 'inv-1');
      expect(url).toBe('https://s3.amazonaws.com/invoice.pdf');
    });
  });

  describe('checkUsageThresholds', () => {
    it('publishes threshold alert when usage exceeds 80%', async () => {
      const db = await getMockDb();
      const { createPublisher } = await import('@platform/events');

      const mockSub = {
        current_period_start: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        current_period_end: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        plan_id: 'plan-1',
      };

      db.limit
        .mockResolvedValueOnce([mockSub])
        .mockResolvedValueOnce([{ limits: { contacts: 1000 } }]);

      db.groupBy.mockResolvedValueOnce([
        { resource: 'contacts', total: 850 }, // 85% — above threshold
      ]);

      await service.checkUsageThresholds('tenant-1');

      expect(createPublisher).toHaveBeenCalledWith('tenant-1', expect.any(Object));
    });

    it('does not alert when usage is below 80%', async () => {
      const db = await getMockDb();
      const { createPublisher } = await import('@platform/events');

      const mockSub = {
        current_period_start: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        current_period_end: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
        plan_id: 'plan-1',
      };

      db.limit
        .mockResolvedValueOnce([mockSub])
        .mockResolvedValueOnce([{ limits: { contacts: 1000 } }]);

      db.groupBy.mockResolvedValueOnce([
        { resource: 'contacts', total: 500 }, // 50% — below threshold
      ]);

      await service.checkUsageThresholds('tenant-1');

      expect(createPublisher).not.toHaveBeenCalled();
    });
  });

  describe('handleStripeWebhook', () => {
    it('throws ValidationError on invalid Stripe signature', async () => {
      await expect(
        service.handleStripeWebhook(
          Buffer.from('{}'),
          'invalid-sig',
          'whsec_test',
        ),
      ).rejects.toThrow(ValidationError);
    });
  });
});
