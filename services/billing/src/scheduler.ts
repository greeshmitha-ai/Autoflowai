/**
 * Scheduled jobs for billing:
 * - Hourly: refresh usage dashboard cache per active tenant
 * - Daily: check usage thresholds and alert at 80%
 * - Payment retry: 3-day and 7-day retry for past_due subscriptions
 * - Invoice PDF generation: async job within 24h of billing cycle close
 */
import { eq, sql } from 'drizzle-orm';
import { getDb, subscriptions, invoices } from '@platform/db';
import { BillingService } from './billing.service.js';

export function startScheduler(billingService: BillingService): void {
  // Hourly: refresh usage cache for all active tenants
  setInterval(
    async () => {
      await refreshUsageDashboard(billingService);
    },
    60 * 60 * 1000,
  );

  // Every 6 hours: check usage thresholds
  setInterval(
    async () => {
      await checkAllUsageThresholds(billingService);
    },
    6 * 60 * 60 * 1000,
  );

  // Daily: retry failed payments (3-day and 7-day schedule)
  setInterval(
    async () => {
      await processPaymentRetries(billingService);
    },
    24 * 60 * 60 * 1000,
  );

  // Every 4 hours: generate missing invoice PDFs
  setInterval(
    async () => {
      await generateMissingInvoicePdfs(billingService);
    },
    4 * 60 * 60 * 1000,
  );
}

async function refreshUsageDashboard(billingService: BillingService): Promise<void> {
  const db = getDb();
  const activeSubs = await db
    .select({ tenant_id: subscriptions.tenant_id })
    .from(subscriptions)
    .where(eq(subscriptions.status, 'active'));

  for (const { tenant_id } of activeSubs) {
    try {
      await billingService.getUsage(tenant_id);
    } catch (err) {
      console.error(`Failed to refresh usage for tenant ${tenant_id}:`, err);
    }
  }
}

async function checkAllUsageThresholds(billingService: BillingService): Promise<void> {
  const db = getDb();
  const activeSubs = await db
    .select({ tenant_id: subscriptions.tenant_id })
    .from(subscriptions)
    .where(eq(subscriptions.status, 'active'));

  for (const { tenant_id } of activeSubs) {
    try {
      await billingService.checkUsageThresholds(tenant_id);
    } catch (err) {
      console.error(`Failed to check usage thresholds for tenant ${tenant_id}:`, err);
    }
  }
}

async function processPaymentRetries(billingService: BillingService): Promise<void> {
  const db = getDb();
  const now = new Date();

  // Find past_due subscriptions
  const pastDueSubs = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.status, 'past_due'));

  for (const sub of pastDueSubs) {
    const daysSinceCreated = Math.floor(
      (now.getTime() - sub.created_at.getTime()) / (24 * 60 * 60 * 1000),
    );

    // Retry at 3 days and 7 days
    if (daysSinceCreated === 3 || daysSinceCreated === 7) {
      try {
        await billingService.retryFailedPayment(sub.tenant_id);
      } catch (err) {
        console.error(`Payment retry failed for tenant ${sub.tenant_id}:`, err);
      }
    }

    // Suspend after 7 days with no payment
    if (daysSinceCreated > 7) {
      try {
        await billingService.suspendTenant(sub.tenant_id);
      } catch (err) {
        console.error(`Failed to suspend tenant ${sub.tenant_id}:`, err);
      }
    }
  }
}

async function generateMissingInvoicePdfs(billingService: BillingService): Promise<void> {
  const db = getDb();

  // Find invoices without PDF URLs created within the last 24 hours
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const missingPdfs = await db
    .select()
    .from(invoices)
    .where(
      sql`pdf_url IS NULL AND created_at >= ${oneDayAgo.toISOString()}`,
    )
    .limit(100);

  for (const invoice of missingPdfs) {
    try {
      await billingService.generateInvoicePdf(invoice.invoice_id, invoice.tenant_id);
    } catch (err) {
      console.error(`Failed to generate PDF for invoice ${invoice.invoice_id}:`, err);
    }
  }
}
