/**
 * Kafka consumer for attribution touchpoint events.
 *
 * Consumed events:
 *   campaign.opened    → email touchpoint
 *   campaign.clicked   → email/campaign touchpoint
 *   conversation.closed → chatbot touchpoint
 *   call.completed     → call touchpoint
 *   deal.status_updated (new_status=won) → trigger attribution calculation
 *
 * Requirements: 24.1, 24.2
 */
import { EventConsumer } from '@platform/events';
import type {
  CampaignOpenedEvent,
  CampaignClickedEvent,
  ConversationClosedEvent,
  CallCompletedEvent,
  DealStatusUpdatedEvent,
} from '@platform/events';
import { recordTouchpoint, recordConversionAndCalculate } from './attribution.service.js';
import type { AttributionConfig } from './config.js';

// Default attribution model — in production this would be loaded from tenant config
const DEFAULT_MODEL = 'linear' as const;

export function startAttributionConsumer(config: AttributionConfig): EventConsumer {
  const consumer = new EventConsumer({
    brokers: config.kafkaBrokers,
    groupId: 'attribution-consumer',
  });

  consumer.withDeadLetterQueue({ topic: 'attribution-dlq' });

  // ── campaign.opened → email touchpoint ────────────────────────────────────
  consumer.on<CampaignOpenedEvent>('campaign.opened', async (event) => {
    const { tenant_id } = event;
    const { campaign_id, contact_id } = event.payload;

    await recordTouchpoint(tenant_id, {
      contact_id,
      channel: 'email',
      campaign_id,
      event_type: 'campaign.opened',
      occurred_at: new Date(event.timestamp),
    });
  });

  // ── campaign.clicked → campaign touchpoint ────────────────────────────────
  consumer.on<CampaignClickedEvent>('campaign.clicked', async (event) => {
    const { tenant_id } = event;
    const { campaign_id, contact_id } = event.payload;

    await recordTouchpoint(tenant_id, {
      contact_id,
      channel: 'campaign',
      campaign_id,
      event_type: 'campaign.clicked',
      occurred_at: new Date(event.timestamp),
    });
  });

  // ── conversation.closed → chatbot touchpoint ──────────────────────────────
  consumer.on<ConversationClosedEvent>('conversation.closed', async (event) => {
    const { tenant_id } = event;
    const { contact_id } = event.payload;

    await recordTouchpoint(tenant_id, {
      contact_id,
      channel: 'chatbot',
      campaign_id: null,
      event_type: 'conversation.closed',
      occurred_at: new Date(event.timestamp),
    });
  });

  // ── call.completed → call touchpoint ──────────────────────────────────────
  consumer.on<CallCompletedEvent>('call.completed', async (event) => {
    const { tenant_id } = event;
    const { contact_id } = event.payload;

    await recordTouchpoint(tenant_id, {
      contact_id,
      channel: 'call',
      campaign_id: null,
      event_type: 'call.completed',
      occurred_at: new Date(event.timestamp),
    });
  });

  // ── deal.status_updated (won) → calculate attribution ─────────────────────
  consumer.on<DealStatusUpdatedEvent>('deal.status_updated', async (event) => {
    const { tenant_id } = event;
    const { contact_id, new_status } = event.payload;

    if (new_status !== 'won') return;

    await recordConversionAndCalculate(
      tenant_id,
      contact_id,
      'deal_closed_won',
      DEFAULT_MODEL,
      new Date(event.timestamp),
    );
  });

  return consumer;
}

export async function runAttributionConsumer(
  config: AttributionConfig,
): Promise<EventConsumer> {
  const consumer = startAttributionConsumer(config);
  await consumer.connect();
  await consumer.subscribe(['campaigns', 'conversations', 'calls', 'crm']);
  await consumer.run();
  return consumer;
}
