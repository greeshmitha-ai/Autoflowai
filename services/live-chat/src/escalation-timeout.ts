/**
 * Escalation timeout fallback.
 * If no operator accepts within the configured timeout, send an automated
 * delay acknowledgment message to the session.
 */
import { getDb, liveChatSessions, liveChatMessages } from '@platform/db';
import { eq, and } from 'drizzle-orm';
import { broadcastToOperators } from './operator-registry.js';

const DELAY_ACK_MESSAGE =
  'Thank you for your patience. All our operators are currently busy. ' +
  'We will connect you with an operator as soon as possible. ' +
  'You may also leave a message and we will get back to you shortly.';

/**
 * Starts a timer. If the session is still in "waiting" state after
 * `timeoutSeconds`, inserts a system message and notifies operators.
 */
export function startEscalationTimeout(
  tenantId: string,
  sessionId: string,
  timeoutSeconds: number,
  _kafkaBrokers: string[],
): void {
  setTimeout(async () => {
    try {
      const db = getDb();
      const [session] = await db
        .select()
        .from(liveChatSessions)
        .where(
          and(
            eq(liveChatSessions.tenant_id, tenantId),
            eq(liveChatSessions.session_id, sessionId),
            eq(liveChatSessions.status, 'waiting'),
          ),
        )
        .limit(1);

      if (!session) return; // Already assigned or closed

      // Insert automated delay acknowledgment
      await db.insert(liveChatMessages).values({
        session_id: sessionId,
        tenant_id: tenantId,
        sender_type: 'system',
        sender_id: 'system',
        content: DELAY_ACK_MESSAGE,
        sent_at: new Date(),
      });

      // Notify operators that timeout occurred
      broadcastToOperators(tenantId, {
        type: 'escalation_timeout',
        session_id: sessionId,
        message: DELAY_ACK_MESSAGE,
      });
    } catch (err) {
      console.error('[EscalationTimeout] Error handling timeout for session', sessionId, err);
    }
  }, timeoutSeconds * 1000);
}
