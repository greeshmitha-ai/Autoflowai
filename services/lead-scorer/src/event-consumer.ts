/**
 * Kafka event consumer for lead scorer.
 * Listens to qualifying interaction events and triggers immediate score recalculation.
 *
 * Qualifying events:
 *   campaign.opened, campaign.clicked, conversation.closed, call.completed, contact.updated
 */
import { EventConsumer } from '@platform/events';
import type {
  CampaignOpenedEvent,
  CampaignClickedEvent,
  ConversationClosedEvent,
  CallCompletedEvent,
  ContactUpdatedEvent,
} from '@platform/events';
import { LeadScorerService } from './lead-scorer.service.js';

export async function startEventConsumer(
  service: LeadScorerService,
  kafkaBrokers: string[],
): Promise<EventConsumer> {
  const consumer = new EventConsumer({
    brokers: kafkaBrokers,
    clientId: 'lead-scorer',
    groupId: 'lead-scorer-group',
  });

  consumer.withDeadLetterQueue({ topic: 'lead-scorer-dlq', maxRetries: 3 });

  consumer.on<CampaignOpenedEvent>('campaign.opened', async (event) => {
    const { tenant_id, payload } = event;
    await service.recalculateScore(tenant_id, payload.contact_id);
  });

  consumer.on<CampaignClickedEvent>('campaign.clicked', async (event) => {
    const { tenant_id, payload } = event;
    await service.recalculateScore(tenant_id, payload.contact_id);
  });

  consumer.on<ConversationClosedEvent>('conversation.closed', async (event) => {
    const { tenant_id, payload } = event;
    await service.recalculateScore(tenant_id, payload.contact_id);
  });

  consumer.on<CallCompletedEvent>('call.completed', async (event) => {
    const { tenant_id, payload } = event;
    await service.recalculateScore(tenant_id, payload.contact_id);
  });

  consumer.on<ContactUpdatedEvent>('contact.updated', async (event) => {
    const { tenant_id, payload } = event;
    await service.recalculateScore(tenant_id, payload.contact_id);
  });

  await consumer.connect();
  await consumer.subscribe([
    'contacts',
    'campaigns',
    'conversations',
    'calls',
  ]);
  await consumer.run();

  return consumer;
}
