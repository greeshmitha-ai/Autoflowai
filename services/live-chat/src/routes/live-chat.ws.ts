/**
 * WebSocket handler for live chat operators.
 *
 * Message types (inbound from operator):
 *   { type: "accept", session_id }
 *   { type: "message", session_id, content }
 *   { type: "close", session_id }
 *
 * Message types (outbound to operator):
 *   { type: "assignment_available", session_id, ... }
 *   { type: "message", session_id, sender_type, sender_id, content, sent_at }
 *   { type: "session_accepted", session_id }
 *   { type: "session_closed", session_id }
 *   { type: "error", message }
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import { verifyJwt } from '../middleware/jwt-auth.js';
import {
  assignOperator,
  addMessage,
  closeSession,
  ValidationError,
  NotFoundError,
} from '../live-chat.service.js';
import {
  registerOperator,
  unregisterOperator,
  sendToOperator,
} from '../operator-registry.js';
import type { LiveChatConfig } from '../config.js';

type WsAcceptMessage = { type: 'accept'; session_id: string };
type WsChatMessage = { type: 'message'; session_id: string; content: string };
type WsCloseMessage = { type: 'close'; session_id: string };
type WsInbound = WsAcceptMessage | WsChatMessage | WsCloseMessage;

function send(connection: SocketStream, payload: Record<string, unknown>): void {
  if (connection.socket.readyState === connection.socket.OPEN) {
    connection.socket.send(JSON.stringify(payload));
  }
}

export function registerLiveChatWebSocket(
  app: FastifyInstance,
  config: LiveChatConfig,
): void {
  app.get(
    '/live-chat/ws',
    { websocket: true },
    async (connection: SocketStream, request: FastifyRequest) => {
      // Authenticate via query param token (WS can't set Authorization header easily)
      const token = (request.query as Record<string, string>)['token'];
      if (!token || !config.jwtPublicKey) {
        send(connection, { type: 'error', message: 'Authentication required' });
        connection.socket.close(1008, 'Unauthorized');
        return;
      }

      let operatorId: string;
      let tenantId: string;

      try {
        const payload = verifyJwt(token, config.jwtPublicKey);
        operatorId = payload.user_id;
        tenantId = payload.tenant_id;
      } catch {
        send(connection, { type: 'error', message: 'Invalid or expired token' });
        connection.socket.close(1008, 'Unauthorized');
        return;
      }

      // Register operator connection
      registerOperator({ operatorId, tenantId, connection });

      send(connection, { type: 'connected', operator_id: operatorId, tenant_id: tenantId });

      connection.socket.on('message', async (raw: Buffer | string) => {
        let msg: WsInbound;
        try {
          msg = JSON.parse(raw.toString()) as WsInbound;
        } catch {
          send(connection, { type: 'error', message: 'Invalid JSON' });
          return;
        }

        // ── Accept session ────────────────────────────────────────────────────
        if (msg.type === 'accept') {
          const { session_id } = msg;
          if (!session_id) {
            send(connection, { type: 'error', message: 'session_id is required' });
            return;
          }

          try {
            const session = await assignOperator(tenantId, session_id, operatorId);

            send(connection, {
              type: 'session_accepted',
              session_id: session.session_id,
              contact_id: session.contact_id,
              conversation_id: session.conversation_id,
            });

            // Notify customer (via system message) that operator joined
            await addMessage(tenantId, session_id, 'system', 'system', 'An operator has joined the chat.');
          } catch (err) {
            if (err instanceof ValidationError) {
              send(connection, { type: 'error', message: err.message });
            } else if (err instanceof NotFoundError) {
              send(connection, { type: 'error', message: 'Session not found' });
            } else {
              app.log.error({ err }, 'Failed to accept session');
              send(connection, { type: 'error', message: 'Failed to accept session' });
            }
          }
          return;
        }

        // ── Send message ──────────────────────────────────────────────────────
        if (msg.type === 'message') {
          const { session_id, content } = msg;
          if (!session_id || !content) {
            send(connection, { type: 'error', message: 'session_id and content are required' });
            return;
          }

          try {
            const stored = await addMessage(tenantId, session_id, 'operator', operatorId, content);

            // Echo back to sender
            send(connection, {
              type: 'message',
              session_id,
              message_id: stored.message_id,
              sender_type: 'operator',
              sender_id: operatorId,
              content: stored.content,
              sent_at: stored.sent_at,
            });

            // In a full implementation, this would also push to the customer's channel.
            // For now, we broadcast to all operators on the session so they stay in sync.
          } catch (err) {
            if (err instanceof ValidationError) {
              send(connection, { type: 'error', message: err.message });
            } else if (err instanceof NotFoundError) {
              send(connection, { type: 'error', message: 'Session not found' });
            } else {
              app.log.error({ err }, 'Failed to send message');
              send(connection, { type: 'error', message: 'Failed to send message' });
            }
          }
          return;
        }

        // ── Close session ─────────────────────────────────────────────────────
        if (msg.type === 'close') {
          const { session_id } = msg;
          if (!session_id) {
            send(connection, { type: 'error', message: 'session_id is required' });
            return;
          }

          try {
            await closeSession(tenantId, session_id);

            send(connection, { type: 'session_closed', session_id });

            // Notify other operators
            sendToOperator(tenantId, operatorId, {
              type: 'session_closed',
              session_id,
            });
          } catch (err) {
            if (err instanceof NotFoundError) {
              send(connection, { type: 'error', message: 'Session not found' });
            } else {
              app.log.error({ err }, 'Failed to close session');
              send(connection, { type: 'error', message: 'Failed to close session' });
            }
          }
          return;
        }

        send(connection, { type: 'error', message: 'Unknown message type' });
      });

      connection.socket.on('close', () => {
        unregisterOperator(tenantId, operatorId);
      });

      connection.socket.on('error', (err: Error) => {
        app.log.error({ err }, 'Operator WebSocket error');
        unregisterOperator(tenantId, operatorId);
      });
    },
  );
}
