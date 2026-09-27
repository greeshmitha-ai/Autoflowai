import { eq, and, sql, count } from 'drizzle-orm';
import {
  getDb,
  campaigns,
  emailTemplates,
  campaignDeliveries,
  contactUnsubscribes,
  type Campaign,
  type NewCampaign,
  type EmailTemplate,
  type NewEmailTemplate,
  type AudienceFilter,
} from '@platform/db';
import { createPublisher } from '@platform/events';
import { buildRecipientList } from './audience.js';
import { DeliveryQueue, type DeliveryBatch } from './delivery.queue.js';
import { randomUUID } from 'crypto';

export interface CampaignStats {
  campaign_id: string;
  total_recipients: number;
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  unsubscribed: number;
  delivery_rate: number;
  open_rate: number;
  click_rate: number;
  unsubscribe_rate: number;
}

export interface CampaignReport extends CampaignStats {
  campaign_name: string;
  channel: string;
  status: string;
  generated_at: string;
}

export class CampaignService {
  private deliveryQueue: DeliveryQueue;
  private kafkaBrokers: string[];

  constructor(kafkaBrokers: string[], rateLimit = 100, batchSize = 1000) {
    this.kafkaBrokers = kafkaBrokers;
    this.deliveryQueue = new DeliveryQueue(
      (batch) => this.processBatch(batch),
      rateLimit,
      batchSize,
    );
  }

  // ─── Campaign CRUD ──────────────────────────────────────────────────────────

  async createCampaign(
    tenantId: string,
    userId: string,
    body: {
      name: string;
      channel: 'email' | 'sms' | 'in_app';
      audience_filter?: AudienceFilter;
      scheduled_at?: string;
      template_id?: string;
    },
  ): Promise<Campaign> {
    const db = getDb();
    const [campaign] = await db
      .insert(campaigns)
      .values({
        tenant_id: tenantId,
        name: body.name,
        channel: body.channel,
        status: body.scheduled_at ? 'scheduled' : 'draft',
        audience_filter: body.audience_filter ?? {},
        scheduled_at: body.scheduled_at ? new Date(body.scheduled_at) : null,
        template_id: body.template_id ?? null,
        created_by: userId,
      } satisfies NewCampaign)
      .returning();

    if (!campaign) throw new Error('Failed to create campaign');
    return campaign;
  }

  async updateCampaign(
    tenantId: string,
    campaignId: string,
    body: {
      name?: string;
      channel?: 'email' | 'sms' | 'in_app';
      audience_filter?: AudienceFilter;
      scheduled_at?: string | null;
      template_id?: string | null;
      status?: 'draft' | 'scheduled' | 'sending' | 'completed' | 'cancelled';
    },
  ): Promise<Campaign | null> {
    const db = getDb();

    const updates: Partial<NewCampaign> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.channel !== undefined) updates.channel = body.channel;
    if (body.audience_filter !== undefined) updates.audience_filter = body.audience_filter;
    if (body.scheduled_at !== undefined)
      updates.scheduled_at = body.scheduled_at ? new Date(body.scheduled_at) : null;
    if (body.template_id !== undefined) updates.template_id = body.template_id;
    if (body.status !== undefined) updates.status = body.status;

    const [campaign] = await db
      .update(campaigns)
      .set(updates)
      .where(and(eq(campaigns.tenant_id, tenantId), eq(campaigns.campaign_id, campaignId)))
      .returning();

    return campaign ?? null;
  }

  async getCampaign(tenantId: string, campaignId: string): Promise<Campaign | null> {
    const db = getDb();
    const [campaign] = await db
      .select()
      .from(campaigns)
      .where(and(eq(campaigns.tenant_id, tenantId), eq(campaigns.campaign_id, campaignId)))
      .limit(1);
    return campaign ?? null;
  }

  // ─── Campaign Stats (6.1) ───────────────────────────────────────────────────

  async getCampaignStats(tenantId: string, campaignId: string): Promise<CampaignStats | null> {
    const campaign = await this.getCampaign(tenantId, campaignId);
    if (!campaign) return null;

    const db = getDb();
    const rows = await db
      .select({
        status: campaignDeliveries.status,
        cnt: count(),
      })
      .from(campaignDeliveries)
      .where(
        and(
          eq(campaignDeliveries.campaign_id, campaignId),
          eq(campaignDeliveries.tenant_id, tenantId),
        ),
      )
      .groupBy(campaignDeliveries.status);

    const counts: Record<string, number> = {};
    for (const row of rows) {
      counts[row.status] = Number(row.cnt);
    }

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const sent = (counts['sent'] ?? 0) + (counts['delivered'] ?? 0) + (counts['opened'] ?? 0) + (counts['clicked'] ?? 0) + (counts['unsubscribed'] ?? 0);
    const delivered = (counts['delivered'] ?? 0) + (counts['opened'] ?? 0) + (counts['clicked'] ?? 0) + (counts['unsubscribed'] ?? 0);
    const opened = counts['opened'] ?? 0;
    const clicked = counts['clicked'] ?? 0;
    const bounced = counts['bounced'] ?? 0;
    const unsubscribed = counts['unsubscribed'] ?? 0;

    return {
      campaign_id: campaignId,
      total_recipients: total,
      sent,
      delivered,
      opened,
      clicked,
      bounced,
      unsubscribed,
      delivery_rate: sent > 0 ? delivered / sent : 0,
      open_rate: delivered > 0 ? opened / delivered : 0,
      click_rate: delivered > 0 ? clicked / delivered : 0,
      unsubscribe_rate: delivered > 0 ? unsubscribed / delivered : 0,
    };
  }

  // ─── Campaign Send (6.3) ────────────────────────────────────────────────────

  async sendCampaign(
    tenantId: string,
    campaignId: string,
    scheduledAt?: string,
  ): Promise<{ queued: boolean; recipient_count: number; scheduled_at?: string }> {
    const db = getDb();
    const campaign = await this.getCampaign(tenantId, campaignId);
    if (!campaign) throw new NotFoundError('Campaign not found');

    if (campaign.status === 'sending' || campaign.status === 'completed') {
      throw new ValidationError(`Campaign is already ${campaign.status}`);
    }

    // Build recipient list, excluding unsubscribed contacts
    const unsubscribed = await db
      .select({ contact_id: contactUnsubscribes.contact_id })
      .from(contactUnsubscribes)
      .where(
        and(
          eq(contactUnsubscribes.tenant_id, tenantId),
          eq(contactUnsubscribes.channel, campaign.channel),
        ),
      );

    const excludeSet = new Set(unsubscribed.map((u) => u.contact_id));
    const recipientIds = await buildRecipientList(
      tenantId,
      campaign.audience_filter as AudienceFilter,
      excludeSet,
    );

    const sendAt = scheduledAt ? new Date(scheduledAt) : undefined;
    const isScheduled = sendAt && sendAt > new Date();

    // Update campaign status
    await db
      .update(campaigns)
      .set({
        status: isScheduled ? 'scheduled' : 'sending',
        scheduled_at: sendAt ?? null,
      })
      .where(eq(campaigns.campaign_id, campaignId));

    if (!isScheduled) {
      // Create delivery records
      if (recipientIds.length > 0) {
        const deliveryRows = recipientIds.map((contactId) => ({
          campaign_id: campaignId,
          tenant_id: tenantId,
          contact_id: contactId,
          status: 'pending' as const,
        }));

        // Insert in chunks to avoid parameter limits
        for (let i = 0; i < deliveryRows.length; i += 500) {
          await db.insert(campaignDeliveries).values(deliveryRows.slice(i, i + 500)).onConflictDoNothing();
        }

        // Enqueue for delivery
        this.deliveryQueue.enqueue({
          jobId: randomUUID(),
          campaignId,
          tenantId,
          contactIds: recipientIds,
          channel: campaign.channel,
        });
      }
    }

    return {
      queued: true,
      recipient_count: recipientIds.length,
      ...(sendAt ? { scheduled_at: sendAt.toISOString() } : {}),
    };
  }

  // ─── Batch delivery processor (6.4) ────────────────────────────────────────

  private async processBatch(batch: DeliveryBatch): Promise<void> {
    const db = getDb();
    const now = new Date();

    // Mark batch as sent
    for (let i = 0; i < batch.contactIds.length; i += 100) {
      const chunk = batch.contactIds.slice(i, i + 100);
      await db
        .update(campaignDeliveries)
        .set({ status: 'sent', sent_at: now })
        .where(
          and(
            eq(campaignDeliveries.campaign_id, batch.campaignId),
            sql`${campaignDeliveries.contact_id} = ANY(${chunk})`,
          ),
        );
    }

    // Publish campaign.sent event
    try {
      const publisher = createPublisher(batch.tenantId, { brokers: this.kafkaBrokers });
      await publisher.connect();
      await publisher.publish('campaigns', 'campaign.sent', {
        campaign_id: batch.campaignId,
        recipient_count: batch.contactIds.length,
      } as never);
      await publisher.disconnect();
    } catch (err) {
      console.error('Failed to publish campaign.sent event:', err);
    }

    // Check if all batches are done and mark campaign completed
    await this.checkAndCompleteCampaign(batch.campaignId, batch.tenantId);
  }

  private async checkAndCompleteCampaign(campaignId: string, tenantId: string): Promise<void> {
    const db = getDb();
    const [pending] = await db
      .select({ cnt: count() })
      .from(campaignDeliveries)
      .where(
        and(
          eq(campaignDeliveries.campaign_id, campaignId),
          eq(campaignDeliveries.status, 'pending'),
        ),
      );

    if ((pending?.cnt ?? 0) === 0) {
      await db
        .update(campaigns)
        .set({ status: 'completed' })
        .where(
          and(
            eq(campaigns.campaign_id, campaignId),
            eq(campaigns.tenant_id, tenantId),
            eq(campaigns.status, 'sending'),
          ),
        );
    }
  }

  // ─── Campaign Report (6.8) ──────────────────────────────────────────────────

  async getCampaignReport(tenantId: string, campaignId: string): Promise<CampaignReport | null> {
    const campaign = await this.getCampaign(tenantId, campaignId);
    if (!campaign) return null;

    const stats = await this.getCampaignStats(tenantId, campaignId);
    if (!stats) return null;

    return {
      ...stats,
      campaign_name: campaign.name,
      channel: campaign.channel,
      status: campaign.status,
      generated_at: new Date().toISOString(),
    };
  }

  // ─── Email Templates ────────────────────────────────────────────────────────

  async createTemplate(
    tenantId: string,
    body: { name: string; html_content?: string; text_content?: string },
  ): Promise<EmailTemplate> {
    const db = getDb();
    const [template] = await db
      .insert(emailTemplates)
      .values({
        tenant_id: tenantId,
        name: body.name,
        html_content: body.html_content ?? '',
        text_content: body.text_content ?? '',
      } satisfies NewEmailTemplate)
      .returning();

    if (!template) throw new Error('Failed to create template');
    return template;
  }

  async updateTemplate(
    tenantId: string,
    templateId: string,
    body: { name?: string; html_content?: string; text_content?: string },
  ): Promise<EmailTemplate | null> {
    const db = getDb();
    const updates: Partial<NewEmailTemplate> = {};
    if (body.name !== undefined) updates.name = body.name;
    if (body.html_content !== undefined) updates.html_content = body.html_content;
    if (body.text_content !== undefined) updates.text_content = body.text_content;

    const [template] = await db
      .update(emailTemplates)
      .set(updates)
      .where(
        and(eq(emailTemplates.tenant_id, tenantId), eq(emailTemplates.template_id, templateId)),
      )
      .returning();

    return template ?? null;
  }

  async getTemplate(tenantId: string, templateId: string): Promise<EmailTemplate | null> {
    const db = getDb();
    const [template] = await db
      .select()
      .from(emailTemplates)
      .where(
        and(eq(emailTemplates.tenant_id, tenantId), eq(emailTemplates.template_id, templateId)),
      )
      .limit(1);
    return template ?? null;
  }

  async listTemplates(tenantId: string): Promise<EmailTemplate[]> {
    const db = getDb();
    return db
      .select()
      .from(emailTemplates)
      .where(eq(emailTemplates.tenant_id, tenantId))
      .orderBy(emailTemplates.created_at);
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}
