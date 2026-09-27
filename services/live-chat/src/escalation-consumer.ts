/**
 * Kafka consumer for conversation.escalated events.
 * Creates a live_chat_session and notifies available operators.
 */
import { EventConsumer } from '@platform/events';
import type { ConversationEscalatedEvent } from '@platform/events';
import { createSession } from './live-chat.service.js';
import { broadcastToOperators } from './operator-registry.js';
import type { LiveChatConfig } from './config.js';
import { startEscalationTimeout } from './escalation-timeout.js';

export function startEscalationConsumer(config: LiveChatConfig): EventConsumer {
  const consumer = new EventConsumer({
    brokers: config.kafkaBrokers,
    groupId: 'live-chat-escalation',
  });

  consumer.withDeadLetterQueue({ topic: 'live-chat-dlq' });

  consumer.on<ConversationEscalatedEvent>(
    'conversation.escalated',
    async (event) => {
      const { tenant_id } = event;
      const { conversation_id, contact_id } = event.payload;

      // Create a waiting session
      const session = await createSession(tenant_id, {
        conversation_id,
        contact_id: contact_id ?? undefined,
      });

      // Notify all connected operators for this tenant
      broadcastToOperators(tenant_id, {
        type: 'assignment_available',
        session_id: session.session_id,
        conversation_id,
        contact_id: contact_id ?? null,
        created_at: session.created_at,
      });

      // Start escalation timeout fallback
      startEscalationTimeout(
        tenant_id,
        session.session_id,
        config.escalationTimeoutSeconds,
        config.kafkaBrokers,
      );
    },
  );

  return consumer;
}

export async function runEscalationConsumer(config: LiveChatConfig): Promise<EventConsumer> {
  const consumer = startEscalationConsumer(config);
  await consumer.connect();
  await consumer.subscribe(['chatbot']);
  await consumer.run();
  return consumer;
}
