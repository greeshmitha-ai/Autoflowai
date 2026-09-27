/**
 * Event consumer for automated survey dispatch.
 *
 * Listens for:
 *   - call.completed
 *   - conversation.closed
 *
 * On each event, dispatches a survey invitation via email/SMS (stub).
 * Also publishes survey.low_score events when a submitted response has rating ≤ 6.
 */

import { EventConsumer, EventPublisher } from '@platform/events';
import type { CallCompletedEvent, ConversationClosedEvent } from '@platform/events';
import type { FeedbackConfig } from './config.js';

// ─── Dispatch stub ────────────────────────────────────────────────────────────

async function dispatchSurveyInvitation(
  channel: 'email' | 'sms',
  contactId: string,
  tenantId: string,
  surveyLink: string,
): Promise<void> {
  // Stub: in production, call the Marketing/SMS service
  console.log(
    `[feedback] Dispatching survey via ${channel} to contact ${contactId} (tenant ${tenantId}): ${surveyLink}`,
  );
}

// ─── Low-score publisher ──────────────────────────────────────────────────────

export async function publishLowScoreEvent(
  tenantId: string,
  surveyId: string,
  responseId: string,
  contactId: string | null,
  score: number,
  config: FeedbackConfig,
): Promise<void> {
  if (score > 6) return; // Only publish for detractors (≤ 6)

  const publisher = new EventPublisher(tenantId, { brokers: config.kafkaBrokers });
  try {
    await publisher.connect();
    await publisher.publish('survey-events', 'survey.low_score', {
      survey_id: surveyId,
      response_id: responseId,
      contact_id: contactId,
      score,
    });
  } finally {
    await publisher.disconnect();
  }
}

// ─── Consumer setup ───────────────────────────────────────────────────────────

export function createDispatchConsumer(config: FeedbackConfig): EventConsumer {
  const consumer = new EventConsumer({
    brokers: config.kafkaBrokers,
    clientId: 'feedback-dispatch',
    groupId: 'feedback-dispatch-group',
  });

  consumer.withDeadLetterQueue({ topic: 'feedback-dlq', maxRetries: 3 });

  // Handle call.completed — dispatch post-call survey
  consumer.on<CallCompletedEvent>('call.completed', async (event) => {
    const { contact_id, call_id } = event.payload;
    const surveyLink = `${config.publicBaseUrl}/s/post-call?ref=${call_id}`;
    await dispatchSurveyInvitation('sms', contact_id, event.tenant_id, surveyLink);
  });

  // Handle conversation.closed — dispatch post-chat survey
  consumer.on<ConversationClosedEvent>('conversation.closed', async (event) => {
    const { contact_id, conversation_id } = event.payload;
    const surveyLink = `${config.publicBaseUrl}/s/post-chat?ref=${conversation_id}`;
    await dispatchSurveyInvitation('email', contact_id, event.tenant_id, surveyLink);
  });

  return consumer;
}

export async function startDispatchConsumer(config: FeedbackConfig): Promise<EventConsumer> {
  const consumer = createDispatchConsumer(config);
  await consumer.connect();
  await consumer.subscribe(['call-events', 'conversation-events']);
  await consumer.run();
  return consumer;
}
