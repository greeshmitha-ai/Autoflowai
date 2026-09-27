import { eq, and, lte } from 'drizzle-orm';
import { createHmac } from 'crypto';
import { getDb, webhooks, webhookDeliveries } from '@platform/db';
import type { WebhookDelivery } from '@platform/db';

/** Maximum retry window: 24 hours in milliseconds */
const MAX_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Exponential backoff delays in seconds: 10s, 30s, 1m, 5m, 15m, 30m, 1h, 2h, 4h */
const BACKOFF_DELAYS_SECONDS = [10, 30, 60, 300, 900, 1800, 3600, 7200, 14400];

/** Sign a payload with HMAC-SHA256 using the webhook secret. */
export function signPayload(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Compute next retry timestamp using exponential backoff. Returns null if exhausted. */
export function computeNextRetry(
  createdAt: Date,
  attempts: number,
): Date | null {
  const delaySeconds = BACKOFF_DELAYS_SECONDS[attempts] ?? BACKOFF_DELAYS_SECONDS[BACKOFF_DELAYS_SECONDS.length - 1]!;
  const nextRetry = new Date(Date.now() + delaySeconds * 1000);

  // If next retry would exceed the 24-hour window from creation, exhausted
  if (nextRetry.getTime() - createdAt.getTime() > MAX_RETRY_WINDOW_MS) {
    return null;
  }

  return nextRetry;
}

/** Deliver a single webhook delivery record. */
async function deliverWebhook(delivery: WebhookDelivery): Promise<void> {
  const db = getDb();

  // Fetch the webhook to get url and secret
  const [webhook] = await db
    .select()
    .from(webhooks)
    .where(eq(webhooks.webhook_id, delivery.webhook_id));

  if (!webhook || webhook.status !== 'active') {
    // Webhook deactivated — mark failed
    await db
      .update(webhookDeliveries)
      .set({ status: 'failed', next_retry_at: null })
      .where(eq(webhookDeliveries.delivery_id, delivery.delivery_id));
    return;
  }

  const payloadStr = JSON.stringify(delivery.payload);
  const signature = signPayload(webhook.secret, payloadStr);
  const newAttempts = delivery.attempts + 1;

  try {
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Platform-Signature': `sha256=${signature}`,
        'X-Platform-Event': delivery.event_type,
        'X-Platform-Delivery': delivery.delivery_id,
      },
      body: payloadStr,
      signal: AbortSignal.timeout(10_000), // 10s timeout
    });

    if (response.ok) {
      await db
        .update(webhookDeliveries)
        .set({ status: 'delivered', attempts: newAttempts, next_retry_at: null })
        .where(eq(webhookDeliveries.delivery_id, delivery.delivery_id));
      return;
    }

    // Non-2xx response — schedule retry
    throw new Error(`HTTP ${response.status}`);
  } catch {
    const nextRetry = computeNextRetry(delivery.created_at, newAttempts);

    if (nextRetry === null) {
      // Exhausted — mark undeliverable
      await db
        .update(webhookDeliveries)
        .set({ status: 'failed', attempts: newAttempts, next_retry_at: null })
        .where(eq(webhookDeliveries.delivery_id, delivery.delivery_id));
    } else {
      await db
        .update(webhookDeliveries)
        .set({ attempts: newAttempts, next_retry_at: nextRetry })
        .where(eq(webhookDeliveries.delivery_id, delivery.delivery_id));
    }
  }
}

/** Process all pending deliveries that are due. */
export async function processPendingDeliveries(): Promise<void> {
  const db = getDb();
  const now = new Date();

  const pending = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.status, 'pending'),
        lte(webhookDeliveries.next_retry_at, now),
      ),
    );

  await Promise.allSettled(pending.map(deliverWebhook));
}

/** Start the delivery worker polling loop. */
export function startDeliveryWorker(intervalMs = 10_000): NodeJS.Timeout {
  return setInterval(() => {
    processPendingDeliveries().catch((err) => {
      console.error('[webhook-worker] Error processing deliveries:', err);
    });
  }, intervalMs);
}
