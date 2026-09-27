import { eq, and } from 'drizzle-orm';
import { randomBytes } from 'crypto';
import { getDb, webhooks, webhookDeliveries } from '@platform/db';
import type { Webhook, WebhookDelivery } from '@platform/db';

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

export async function registerWebhook(
  tenantId: string,
  data: { url: string; events: string[] },
): Promise<Webhook> {
  if (!data.url?.trim()) throw new ValidationError('url is required');
  if (!Array.isArray(data.events) || data.events.length === 0) {
    throw new ValidationError('events array must not be empty');
  }

  try {
    new URL(data.url);
  } catch {
    throw new ValidationError('url must be a valid URL');
  }

  const secret = randomBytes(32).toString('hex');
  const db = getDb();

  const [webhook] = await db
    .insert(webhooks)
    .values({
      tenant_id: tenantId,
      url: data.url.trim(),
      events: data.events,
      secret,
      status: 'active',
    })
    .returning();

  if (!webhook) throw new Error('Failed to register webhook');
  return webhook;
}

export async function listWebhooks(tenantId: string): Promise<Webhook[]> {
  const db = getDb();
  return db.select().from(webhooks).where(eq(webhooks.tenant_id, tenantId));
}

export async function getWebhookDeliveries(
  tenantId: string,
  webhookId: string,
): Promise<WebhookDelivery[]> {
  const db = getDb();

  // Verify ownership
  const [webhook] = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.webhook_id, webhookId), eq(webhooks.tenant_id, tenantId)));

  if (!webhook) throw new NotFoundError(`Webhook ${webhookId} not found`);

  return db
    .select()
    .from(webhookDeliveries)
    .where(eq(webhookDeliveries.webhook_id, webhookId));
}

/** Enqueue a delivery record for a webhook event. */
export async function enqueueDelivery(
  webhookId: string,
  tenantId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<WebhookDelivery> {
  const db = getDb();
  const [delivery] = await db
    .insert(webhookDeliveries)
    .values({
      webhook_id: webhookId,
      tenant_id: tenantId,
      event_type: eventType,
      payload,
      status: 'pending',
      attempts: 0,
      next_retry_at: new Date(),
    })
    .returning();

  if (!delivery) throw new Error('Failed to enqueue delivery');
  return delivery;
}
