/**
 * Kafka consumer for inbound conversation events.
 * Handles: conversation.escalated, campaign.unsubscribed, survey.response.submitted
 * Requirements: 20.1, 20.2
 */
import { EventConsumer } from '@platform/events';
import type {
  ConversationEscalatedEvent,
  CampaignUnsubscribedEvent,
  SurveyResponseSubmittedEvent,
} from '@platform/events';
import { createInboxConversation, touchConversation } from './inbox.service.js';
import { broadcastToTenant } from './ws-registry.js';
import type { TeamInboxConfig } from './config.js';

export function startInboxConsumer(config: TeamInboxConfig): EventConsumer {
  const consumer = new EventConsumer({
    brokers: config.kafkaBrokers,
    groupId: 'team-inbox-consumer',
  });

  consumer.withDeadLetterQueue({ topic: 'team-inbox-dlq' });

  // conversation.escalated → create inbox entry for live_chat channel
  consumer.on<ConversationEscalatedEvent>(
    'conversation.escalated',
    async (event) => {
      const { tenant_id } = event;
      const { conversation_id, contact_id } = event.payload;

      const conv = await createInboxConversation(tenant_id, {
        channel: 'live_chat',
        contact_id: contact_id ?? undefined,
        last_message_preview: `Escalated conversation: ${conversation_id}`,
      });

      broadcastToTenant(tenant_id, {
        type: 'new_conversation',
        conversation: conv,
      });
    },
  );

  // campaign.unsubscribed → create inbox entry for the relevant channel
  consumer.on<CampaignUnsubscribedEvent>(
    'campaign.unsubscribed',
    async (event) => {
      const { tenant_id } = event;
      const { contact_id, channel } = event.payload;

      // Map campaign channel to inbox channel
      const inboxChannel = mapCampaignChannel(channel);

      const conv = await createInboxConversation(tenant_id, {
        channel: inboxChannel,
        contact_id: contact_id ?? undefined,
        last_message_preview: 'Contact unsubscribed from campaign',
      });

      broadcastToTenant(tenant_id, {
        type: 'new_conversation',
        conversation: conv,
      });
    },
  );

  // survey.response.submitted → create inbox entry
  consumer.on<SurveyResponseSubmittedEvent>(
    'survey.response.submitted',
    async (event) => {
      const { tenant_id } = event;
      const { response_id, contact_id } = event.payload;

      const conv = await createInboxConversation(tenant_id, {
        channel: 'email',
        contact_id: contact_id ?? undefined,
        last_message_preview: `Survey response submitted: ${response_id}`,
      });

      broadcastToTenant(tenant_id, {
        type: 'new_conversation',
        conversation: conv,
      });
    },
  );

  return consumer;
}

export async function runInboxConsumer(config: TeamInboxConfig): Promise<EventConsumer> {
  const consumer = startInboxConsumer(config);
  await consumer.connect();
  // Subscribe to all relevant topics
  await consumer.subscribe(['chatbot', 'marketing', 'feedback']);
  await consumer.run();
  return consumer;
}

function mapCampaignChannel(channel: string): 'email' | 'sms' | 'live_chat' | 'whatsapp' | 'facebook' {
  switch (channel) {
    case 'sms': return 'sms';
    case 'whatsapp': return 'whatsapp';
    case 'facebook': return 'facebook';
    default: return 'email';
  }
}
