import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import type { AiAdapter } from '../ai-adapter.js';
import type { ChatbotConfig } from '../config.js';
import {
  createConversation,
  appendTranscript,
  getAgent,
  NotFoundError,
} from '../agent.service.js';
import { shouldEscalate, triggerEscalation, FALLBACK_MESSAGE } from '../escalation.service.js';

/** Maximum messages kept in the rolling context window */
const CONTEXT_WINDOW = 20;

interface WsInitMessage {
  type: 'init';
  tenant_id: string;
  agent_id: string;
  contact_id?: string;
  channel?: 'widget' | 'whatsapp' | 'facebook' | 'sms' | 'live_chat';
}

interface WsUserMessage {
  type: 'message';
  content: string;
}

type WsInbound = WsInitMessage | WsUserMessage;

interface WsSession {
  tenantId: string;
  agentId: string;
  conversationId: string;
  contactId: string | null;
  escalationThreshold: number;
  persona: string;
  context: Array<{ role: 'user' | 'assistant'; content: string }>;
}

function send(connection: SocketStream, payload: Record<string, unknown>): void {
  if (connection.socket.readyState === connection.socket.OPEN) {
    connection.socket.send(JSON.stringify(payload));
  }
}

export function registerChatWebSocket(
  app: FastifyInstance,
  ai: AiAdapter,
  config: ChatbotConfig,
): void {
  app.get(
    '/chat',
    { websocket: true },
    async (connection: SocketStream, _request: FastifyRequest) => {
      let session: WsSession | null = null;

      connection.socket.on('message', async (raw: Buffer | string) => {
        let msg: WsInbound;
        try {
          msg = JSON.parse(raw.toString()) as WsInbound;
        } catch {
          send(connection, { type: 'error', message: 'Invalid JSON' });
          return;
        }

        // ── Session init ──────────────────────────────────────────────────────
        if (msg.type === 'init') {
          const { tenant_id, agent_id, contact_id, channel } = msg;

          if (!tenant_id || !agent_id) {
            send(connection, { type: 'error', message: 'tenant_id and agent_id are required' });
            return;
          }

          try {
            const agent = await getAgent(tenant_id, agent_id);
            const conv = await createConversation(tenant_id, {
              agent_id,
              ...(contact_id !== undefined && { contact_id }),
              channel: channel ?? 'widget',
            });

            session = {
              tenantId: tenant_id,
              agentId: agent_id,
              conversationId: conv.conversation_id,
              contactId: contact_id ?? null,
              escalationThreshold: agent.escalation_threshold,
              persona: agent.persona,
              context: [],
            };

            send(connection, {
              type: 'session',
              conversation_id: conv.conversation_id,
              message: 'Session initialized',
            });
          } catch (err) {
            if (err instanceof NotFoundError) {
              send(connection, { type: 'error', message: 'Agent not found' });
            } else {
              send(connection, { type: 'error', message: 'Failed to initialize session' });
            }
          }
          return;
        }

        // ── Message exchange ──────────────────────────────────────────────────
        if (msg.type === 'message') {
          if (!session) {
            send(connection, { type: 'error', message: 'Session not initialized. Send init first.' });
            return;
          }

          const userContent = msg.content?.trim();
          if (!userContent) {
            send(connection, { type: 'error', message: 'content is required' });
            return;
          }

          // Persist user message
          await appendTranscript(session.tenantId, session.conversationId, {
            role: 'user',
            content: userContent,
          });

          // Maintain rolling context window
          session.context.push({ role: 'user', content: userContent });
          if (session.context.length > CONTEXT_WINDOW) {
            session.context = session.context.slice(-CONTEXT_WINDOW);
          }

          // Call AI with 3-second timeout
          let aiResponse: { content: string; confidence: number; available: boolean };
          try {
            const systemPrompt = session.persona || undefined;
            const aiPromise = ai.chat(session.context, systemPrompt);
            const timeoutPromise = new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error('AI timeout')), 3000),
            );
            aiResponse = await Promise.race([aiPromise, timeoutPromise]);
          } catch {
            // AI unavailable — fallback
            aiResponse = { content: FALLBACK_MESSAGE, confidence: 0, available: false };
          }

          // Persist assistant message
          await appendTranscript(session.tenantId, session.conversationId, {
            role: 'assistant',
            content: aiResponse.content,
            confidence: aiResponse.confidence,
          });

          // Update context with assistant reply
          session.context.push({ role: 'assistant', content: aiResponse.content });
          if (session.context.length > CONTEXT_WINDOW) {
            session.context = session.context.slice(-CONTEXT_WINDOW);
          }

          // Check escalation
          if (
            !aiResponse.available ||
            shouldEscalate(aiResponse.confidence, session.escalationThreshold)
          ) {
            const reason = !aiResponse.available
              ? 'AI model unavailable'
              : `Low confidence: ${aiResponse.confidence.toFixed(2)}`;

            void triggerEscalation(
              session.tenantId,
              session.conversationId,
              session.contactId,
              session.agentId,
              reason,
              config.kafkaBrokers,
            ).catch((err) => app.log.error({ err }, 'Failed to trigger escalation'));

            send(connection, {
              type: 'message',
              role: 'assistant',
              content: aiResponse.content,
              confidence: aiResponse.confidence,
              escalated: true,
            });
            return;
          }

          send(connection, {
            type: 'message',
            role: 'assistant',
            content: aiResponse.content,
            confidence: aiResponse.confidence,
            escalated: false,
          });
        }
      });

      connection.socket.on('close', () => {
        session = null;
      });

      connection.socket.on('error', (err: Error) => {
        app.log.error({ err }, 'WebSocket error');
      });
    },
  );
}
