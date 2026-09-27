import { eq, and } from 'drizzle-orm';
import {
  getDb,
  campaigns,
  campaignDeliveries,
  contactUnsubscribes,
} from '@platform/db';
import { createPublisher } from '@platform/events';

export class TrackingService {
  private kafkaBrokers: string[];

  constructor(kafkaBrokers: string[]) {
    this.kafkaBrokers = kafkaBrokers;
  }

  /**
   * Track email open via pixel (GET /track/open/:campaignId/:contactId)
   * Returns a 1x1 transparent GIF.
   */
  async trackOpen(
    tenantId: string,
    campaignId: string,
    contactId: string,
  ): Promise<void> {
    const db = getDb();
    const now = new Date();

    await db
      .update(campaignDeliveries)
      .set({ status: 'opened', opened_at: now })
      .where(
        and(
          eq(campaignDeliveries.campaign_id, campaignId),
          eq(campaignDeliveries.contact_id, contactId),
          eq(campaignDeliveries.tenant_id, tenantId),
        ),
      );

    void this.publishEvent('campaign.opened', tenantId, {
      campaign_id: campaignId,
      contact_id: contactId,
    });
  }

  /**
   * Track link click (GET /track/click/:campaignId/:contactId?url=...)
   * Returns redirect to the original URL.
   */
  async trackClick(
    tenantId: string,
    campaignId: string,
    contactId: string,
  ): Promise<void> {
    const db = getDb();
    const now = new Date();

    await db
      .update(campaignDeliveries)
      .set({ status: 'clicked', clicked_at: now })
      .where(
        and(
          eq(campaignDeliveries.campaign_id, campaignId),
          eq(campaignDeliveries.contact_id, contactId),
          eq(campaignDeliveries.tenant_id, tenantId),
        ),
      );

    void this.publishEvent('campaign.clicked', tenantId, {
      campaign_id: campaignId,
      contact_id: contactId,
      link_url: '',
    });
  }

  /**
   * Handle unsubscribe (POST /track/unsubscribe/:campaignId/:contactId)
   * Persists unsubscribe and excludes contact from future sends.
   */
  async trackUnsubscribe(
    tenantId: string,
    campaignId: string,
    contactId: string,
  ): Promise<void> {
    const db = getDb();
    const now = new Date();

    // Get campaign channel
    const [campaign] = await db
      .select({ channel: campaigns.channel })
      .from(campaigns)
      .where(
        and(eq(campaigns.campaign_id, campaignId), eq(campaigns.tenant_id, tenantId)),
      )
      .limit(1);

    const channel = campaign?.channel ?? 'email';

    // Update delivery status
    await db
      .update(campaignDeliveries)
      .set({ status: 'unsubscribed' })
      .where(
        and(
          eq(campaignDeliveries.campaign_id, campaignId),
          eq(campaignDeliveries.contact_id, contactId),
          eq(campaignDeliveries.tenant_id, tenantId),
        ),
      );

    // Persist unsubscribe (upsert — ignore if already unsubscribed)
    await db
      .insert(contactUnsubscribes)
      .values({
        tenant_id: tenantId,
        contact_id: contactId,
        channel,
        campaign_id: campaignId,
        unsubscribed_at: now,
      })
      .onConflictDoNothing();

    void this.publishEvent('campaign.unsubscribed', tenantId, {
      campaign_id: campaignId,
      contact_id: contactId,
      channel,
    });
  }

  private async publishEvent(
    type: string,
    tenantId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const publisher = createPublisher(tenantId, { brokers: this.kafkaBrokers });
      await publisher.connect();
      await publisher.publish('campaigns', type as never, payload as never);
      await publisher.disconnect();
    } catch (err) {
      console.error(`Failed to publish ${type} event:`, err);
    }
  }
}

/** 1x1 transparent GIF pixel */
export const TRACKING_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64',
);
