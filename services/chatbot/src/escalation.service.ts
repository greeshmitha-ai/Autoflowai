import { EventPublisher } from '@platform/events';
import type { ConversationEscalatedEvent } from '@platform/events';
import { escalateConversation } from './agent.service.js';

export const FALLBACK_MESSAGE =
  "I'm sorry, I'm having trouble processing your request right now. A human agent will follow up with you shortly.";

/**
 * Check if a confidence score is below the agent's escalation threshold.
 */
export function shouldEscalate(confidence: number, threshold: number): boolean {
  return confidence < threshold;
}

/**
 * Escalate a conversation: update DB status and publish event to message bus.
 */
export async function triggerEscalation(
  tenantId: string,
  conversationId: string,
  contactId: string | null,
  agentId: string,
  reason: string,
  kafkaBrokers: string[],
): Promise<void> {
  // Update conversation status in DB
  await escalateConversation(tenantId, conversationId);

  // Publish escalation event
  const publisher = new EventPublisher(tenantId, { brokers: kafkaBrokers });
  try {
    await publisher.connect();
    await publisher.publish<ConversationEscalatedEvent>(
      'conversation-events',
      'conversation.escalated',
      {
        conversation_id: conversationId,
        contact_id: contactId ?? '',
        agent_id: agentId,
        reason,
      },
    );
  } finally {
    await publisher.disconnect();
  }
}
