import Stripe from 'stripe';
import { eq, and, sql, gte, lte } from 'drizzle-orm';
import {
  getDb,
  subscriptionPlans,
  subscriptions,
  invoices,
  usageRecords,
  type Subscription,
  type Invoice,
  type SubscriptionPlan,
} from '@platform/db';
import { TenantCache } from '@platform/cache';
import { createPublisher } from '@platform/events';

export interface SubscribeBody {
  plan_id: string;
  payment_method_id?: string;
}

export interface UsageSummary {
  contacts: number;
  call_minutes: number;
  sms_sent: number;
  ai_tokens: number;
  period_start: string;
  period_end: string;
  limits: Record<string, number>;
}

export class BillingService {
  private stripe: Stripe;
  private kafkaBrokers: string[];

  constructor(stripeSecretKey: string, kafkaBrokers: string[]) {
    this.stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' });
    this.kafkaBrokers = kafkaBrokers;
  }

  // ─── Subscription Management ─────────────────────────────────────────────────

  async subscribe(
    tenantId: string,
    body: SubscribeBody,
  ): Promise<{ subscription: Subscription; plan: SubscriptionPlan }> {
    const db = getDb();

    // Load plan
    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.plan_id, body.plan_id))
      .limit(1);

    if (!plan) throw new NotFoundError('Subscription plan not found');

    // Check for existing subscription
    const [existing] = await db
      .select()
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.tenant_id, tenantId),
          sql`status NOT IN ('cancelled')`,
        ),
      )
      .limit(1);

    let stripeCustomerId: string;
    let stripeSubscriptionId: string;
    let periodStart: Date;
    let periodEnd: Date;

    if (existing) {
      // Upgrade/downgrade existing subscription
      stripeCustomerId = existing.stripe_customer_id;

      const stripeSub = await this.stripe.subscriptions.retrieve(
        existing.stripe_subscription_id,
      );

      const updatedSub = await this.stripe.subscriptions.update(
        existing.stripe_subscription_id,
        {
          items: [
            {
              ...(stripeSub.items.data[0]?.id ? { id: stripeSub.items.data[0].id } : {}),
              price: plan.stripe_price_id,
            },
          ],
          proration_behavior: 'create_prorations',
        },
      );

      stripeSubscriptionId = updatedSub.id;
      periodStart = new Date(updatedSub.current_period_start * 1000);
      periodEnd = new Date(updatedSub.current_period_end * 1000);

      // Update existing subscription record
      const [updated] = await db
        .update(subscriptions)
        .set({
          plan_id: plan.plan_id,
          stripe_subscription_id: stripeSubscriptionId,
          status: 'active',
          current_period_start: periodStart,
          current_period_end: periodEnd,
        })
        .where(eq(subscriptions.subscription_id, existing.subscription_id))
        .returning();

      if (!updated) throw new Error('Failed to update subscription');
      return { subscription: updated, plan };
    }

    // Create new Stripe customer
    const customer = await this.stripe.customers.create({
      metadata: { tenant_id: tenantId },
    });
    stripeCustomerId = customer.id;

    // Attach payment method if provided
    if (body.payment_method_id) {
      await this.stripe.paymentMethods.attach(body.payment_method_id, {
        customer: stripeCustomerId,
      });
      await this.stripe.customers.update(stripeCustomerId, {
        invoice_settings: { default_payment_method: body.payment_method_id },
      });
    }

    // Create Stripe subscription
    const stripeSub = await this.stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: plan.stripe_price_id }],
      expand: ['latest_invoice.payment_intent'],
    });

    stripeSubscriptionId = stripeSub.id;
    periodStart = new Date(stripeSub.current_period_start * 1000);
    periodEnd = new Date(stripeSub.current_period_end * 1000);

    // Store only Stripe IDs — never raw card data
    const [subscription] = await db
      .insert(subscriptions)
      .values({
        tenant_id: tenantId,
        plan_id: plan.plan_id,
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
        status: 'active',
        current_period_start: periodStart,
        current_period_end: periodEnd,
      })
      .returning();

    if (!subscription) throw new Error('Failed to create subscription record');
    return { subscription, plan };
  }

  async upgradeDowngrade(
    tenantId: string,
    newPlanId: string,
  ): Promise<{ subscription: Subscription; plan: SubscriptionPlan; proration_amount_cents: number }> {
    const db = getDb();

    const [plan] = await db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.plan_id, newPlanId))
      .limit(1);

    if (!plan) throw new NotFoundError('Subscription plan not found');

    const [existing] = await db
      .select()
      .from(subscriptions)
      .where(
        and(eq(subscriptions.tenant_id, tenantId), eq(subscriptions.status, 'active')),
      )
      .limit(1);

    if (!existing) throw new NotFoundError('No active subscription found');

    const stripeSub = await this.stripe.subscriptions.retrieve(
      existing.stripe_subscription_id,
    );

    // Apply proration immediately
    const updatedSub = await this.stripe.subscriptions.update(
      existing.stripe_subscription_id,
      {
        items: [
          {
            ...(stripeSub.items.data[0]?.id ? { id: stripeSub.items.data[0].id } : {}),
            price: plan.stripe_price_id,
          },
        ],
        proration_behavior: 'always_invoice',
        billing_cycle_anchor: 'unchanged',
      },
    );

    // Calculate proration amount from upcoming invoice
    let prorationAmountCents = 0;
    try {
      const upcomingInvoice = await this.stripe.invoices.retrieveUpcoming({
        customer: existing.stripe_customer_id,
        subscription: existing.stripe_subscription_id,
      });
      prorationAmountCents = upcomingInvoice.amount_due;
    } catch {
      // Proration calculation is best-effort
    }

    const periodStart = new Date(updatedSub.current_period_start * 1000);
    const periodEnd = new Date(updatedSub.current_period_end * 1000);

    const [updated] = await db
      .update(subscriptions)
      .set({
        plan_id: plan.plan_id,
        status: 'active',
        current_period_start: periodStart,
        current_period_end: periodEnd,
      })
      .where(eq(subscriptions.subscription_id, existing.subscription_id))
      .returning();

    if (!updated) throw new Error('Failed to update subscription');

    // Invalidate usage cache
    const cache = new TenantCache(tenantId, 'billing');
    await cache.del('usage');

    return { subscription: updated, plan, proration_amount_cents: prorationAmountCents };
  }

  // ─── Usage Metering ───────────────────────────────────────────────────────────

  async recordUsage(
    tenantId: string,
    resource: 'contacts' | 'call_minutes' | 'sms_sent' | 'ai_tokens',
    quantity: number,
  ): Promise<void> {
    const db = getDb();
    await db.insert(usageRecords).values({
      tenant_id: tenantId,
      resource,
      quantity,
    });

    // Invalidate usage cache
    const cache = new TenantCache(tenantId, 'billing');
    await cache.del('usage');
  }

  async getUsage(tenantId: string): Promise<UsageSummary> {
    const cache = new TenantCache(tenantId, 'billing');
    const cached = await cache.get<UsageSummary>('usage');
    if (cached) return cached;

    const db = getDb();

    // Get current subscription period
    const [sub] = await db
      .select({
        current_period_start: subscriptions.current_period_start,
        current_period_end: subscriptions.current_period_end,
        plan_id: subscriptions.plan_id,
      })
      .from(subscriptions)
      .where(
        and(eq(subscriptions.tenant_id, tenantId), eq(subscriptions.status, 'active')),
      )
      .limit(1);

    const periodStart = sub?.current_period_start ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const periodEnd = sub?.current_period_end ?? new Date();

    // Aggregate usage per resource in current period
    const rows = await db
      .select({
        resource: usageRecords.resource,
        total: sql<number>`sum(quantity)::int`,
      })
      .from(usageRecords)
      .where(
        and(
          eq(usageRecords.tenant_id, tenantId),
          gte(usageRecords.recorded_at, periodStart),
          lte(usageRecords.recorded_at, periodEnd),
        ),
      )
      .groupBy(usageRecords.resource);

    const usageMap: Record<string, number> = {};
    for (const row of rows) {
      usageMap[row.resource] = row.total ?? 0;
    }

    // Get plan limits
    let limits: Record<string, number> = {};
    if (sub?.plan_id) {
      const [plan] = await db
        .select({ limits: subscriptionPlans.limits })
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.plan_id, sub.plan_id))
        .limit(1);
      limits = (plan?.limits as Record<string, number>) ?? {};
    }

    const summary: UsageSummary = {
      contacts: usageMap['contacts'] ?? 0,
      call_minutes: usageMap['call_minutes'] ?? 0,
      sms_sent: usageMap['sms_sent'] ?? 0,
      ai_tokens: usageMap['ai_tokens'] ?? 0,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      limits,
    };

    // Cache for 1 hour
    await cache.set('usage', summary, { ttl: 3600 });

    return summary;
  }

  // ─── Invoices ─────────────────────────────────────────────────────────────────

  async listInvoices(tenantId: string): Promise<Invoice[]> {
    const db = getDb();
    return db
      .select()
      .from(invoices)
      .where(eq(invoices.tenant_id, tenantId))
      .orderBy(sql`created_at DESC`)
      .limit(50);
  }

  async getInvoice(tenantId: string, invoiceId: string): Promise<Invoice | null> {
    const db = getDb();
    const [invoice] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.tenant_id, tenantId), eq(invoices.invoice_id, invoiceId)))
      .limit(1);
    return invoice ?? null;
  }

  async getInvoicePdfUrl(tenantId: string, invoiceId: string): Promise<string> {
    const invoice = await this.getInvoice(tenantId, invoiceId);
    if (!invoice) throw new NotFoundError('Invoice not found');

    // Return stored PDF URL (S3 signed URL or Stripe PDF URL)
    if (invoice.pdf_url) return invoice.pdf_url;

    // Fallback: fetch from Stripe
    const stripeInvoice = await this.stripe.invoices.retrieve(invoice.stripe_invoice_id);
    const pdfUrl = stripeInvoice.invoice_pdf ?? '';

    if (pdfUrl) {
      // Cache the URL back
      const db = getDb();
      await db
        .update(invoices)
        .set({ pdf_url: pdfUrl })
        .where(eq(invoices.invoice_id, invoiceId));
    }

    return pdfUrl;
  }

  // ─── Stripe Webhook Handling ──────────────────────────────────────────────────

  async handleStripeWebhook(
    payload: Buffer,
    signature: string,
    webhookSecret: string,
  ): Promise<void> {
    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch {
      throw new ValidationError('Invalid Stripe webhook signature');
    }

    switch (event.type) {
      case 'invoice.payment_succeeded':
        await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        await this.handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
    }
  }

  private async handleInvoicePaymentSucceeded(stripeInvoice: Stripe.Invoice): Promise<void> {
    const db = getDb();

    // Find tenant by stripe_customer_id
    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripe_customer_id, stripeInvoice.customer as string))
      .limit(1);

    if (!sub) return;

    // Upsert invoice record
    await db
      .insert(invoices)
      .values({
        tenant_id: sub.tenant_id,
        stripe_invoice_id: stripeInvoice.id,
        amount_cents: stripeInvoice.amount_paid,
        currency: stripeInvoice.currency,
        status: 'paid',
        pdf_url: stripeInvoice.invoice_pdf ?? null,
        period_start: new Date((stripeInvoice.period_start ?? 0) * 1000),
        period_end: new Date((stripeInvoice.period_end ?? 0) * 1000),
      })
      .onConflictDoNothing();

    // Update subscription status to active
    await db
      .update(subscriptions)
      .set({ status: 'active' })
      .where(eq(subscriptions.stripe_subscription_id, stripeInvoice.subscription as string));
  }

  private async handleInvoicePaymentFailed(stripeInvoice: Stripe.Invoice): Promise<void> {
    const db = getDb();

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.stripe_customer_id, stripeInvoice.customer as string))
      .limit(1);

    if (!sub) return;

    // Upsert invoice record
    await db
      .insert(invoices)
      .values({
        tenant_id: sub.tenant_id,
        stripe_invoice_id: stripeInvoice.id,
        amount_cents: stripeInvoice.amount_due,
        currency: stripeInvoice.currency,
        status: 'payment_failed',
        pdf_url: stripeInvoice.invoice_pdf ?? null,
        period_start: new Date((stripeInvoice.period_start ?? 0) * 1000),
        period_end: new Date((stripeInvoice.period_end ?? 0) * 1000),
      })
      .onConflictDoNothing();

    // Mark subscription as past_due
    await db
      .update(subscriptions)
      .set({ status: 'past_due' })
      .where(eq(subscriptions.stripe_subscription_id, stripeInvoice.subscription as string));

    // Publish payment failure event for retry scheduling
    await this.publishBillingEvent(sub.tenant_id, 'billing.payment_failed', {
      tenant_id: sub.tenant_id,
      stripe_invoice_id: stripeInvoice.id,
      amount_cents: stripeInvoice.amount_due,
    });
  }

  private async handleSubscriptionUpdated(stripeSub: Stripe.Subscription): Promise<void> {
    const db = getDb();
    const statusMap: Record<string, 'active' | 'past_due' | 'cancelled' | 'suspended'> = {
      active: 'active',
      past_due: 'past_due',
      canceled: 'cancelled',
      unpaid: 'suspended',
    };

    const status = statusMap[stripeSub.status] ?? 'active';

    await db
      .update(subscriptions)
      .set({
        status,
        current_period_start: new Date(stripeSub.current_period_start * 1000),
        current_period_end: new Date(stripeSub.current_period_end * 1000),
      })
      .where(eq(subscriptions.stripe_subscription_id, stripeSub.id));
  }

  private async handleSubscriptionDeleted(stripeSub: Stripe.Subscription): Promise<void> {
    const db = getDb();
    await db
      .update(subscriptions)
      .set({ status: 'cancelled' })
      .where(eq(subscriptions.stripe_subscription_id, stripeSub.id));
  }

  // ─── Usage Threshold Alerts ───────────────────────────────────────────────────

  async checkUsageThresholds(tenantId: string): Promise<void> {
    const usage = await this.getUsage(tenantId);
    const resources = ['contacts', 'call_minutes', 'sms_sent', 'ai_tokens'] as const;

    for (const resource of resources) {
      const limit = usage.limits[resource];
      if (!limit || limit <= 0) continue;

      const current = usage[resource];
      const pct = current / limit;

      if (pct >= 0.8) {
        await this.publishBillingEvent(tenantId, 'billing.usage_threshold', {
          tenant_id: tenantId,
          resource,
          current,
          limit,
          percentage: Math.round(pct * 100),
        });
      }
    }
  }

  // ─── Payment Retry ────────────────────────────────────────────────────────────

  async retryFailedPayment(tenantId: string): Promise<void> {
    const db = getDb();

    const [sub] = await db
      .select()
      .from(subscriptions)
      .where(
        and(eq(subscriptions.tenant_id, tenantId), eq(subscriptions.status, 'past_due')),
      )
      .limit(1);

    if (!sub) return;

    try {
      // Retry via Stripe — pay the latest open invoice
      const stripeInvoices = await this.stripe.invoices.list({
        customer: sub.stripe_customer_id,
        status: 'open',
        limit: 1,
      });

      const openInvoice = stripeInvoices.data[0];
      if (openInvoice) {
        await this.stripe.invoices.pay(openInvoice.id);
      }
    } catch {
      // Payment still failed — will be handled by webhook
    }
  }

  async suspendTenant(tenantId: string): Promise<void> {
    const db = getDb();

    await db
      .update(subscriptions)
      .set({ status: 'suspended' })
      .where(eq(subscriptions.tenant_id, tenantId));

    await this.publishBillingEvent(tenantId, 'billing.access_suspended', {
      tenant_id: tenantId,
      reason: 'payment_failure',
    });
  }

  // ─── Invoice PDF Generation ───────────────────────────────────────────────────

  async generateInvoicePdf(invoiceId: string, tenantId: string): Promise<string> {
    const invoice = await this.getInvoice(tenantId, invoiceId);
    if (!invoice) throw new NotFoundError('Invoice not found');

    // Fetch from Stripe (Stripe generates the PDF)
    const stripeInvoice = await this.stripe.invoices.retrieve(invoice.stripe_invoice_id);
    const pdfUrl = stripeInvoice.invoice_pdf ?? '';

    if (pdfUrl) {
      const db = getDb();
      await db
        .update(invoices)
        .set({ pdf_url: pdfUrl })
        .where(eq(invoices.invoice_id, invoiceId));
    }

    return pdfUrl;
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  private async publishBillingEvent(
    tenantId: string,
    type: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const publisher = createPublisher(tenantId, { brokers: this.kafkaBrokers });
      await publisher.connect();
      // Use a generic publish approach for billing-specific events
      await publisher.publish('billing', type as never, payload as never);
      await publisher.disconnect();
    } catch (err) {
      console.error(`Failed to publish billing event ${type}:`, err);
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
