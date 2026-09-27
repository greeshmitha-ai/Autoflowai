/**
 * WebSocket handler for Team Inbox real-time updates.
 *
 * Outbound messages (server → client):
 *   { type: "connected", user_id, tenant_id }
 *   { type: "new_conversation", conversation }
 *   { type: "conversation_assigned", inbox_id, assigned_to }
 *   { type: "conversation_status_changed", inbox_id, status }
 *   { type: "error", message }
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SocketStream } from '@fastify/websocket';
import { verifyJwt } from '../middleware/jwt-auth.js';
import { registerClient, unregisterClient } from '../ws-registry.js';
import type { TeamInboxConfig } from '../config.js';

function send(connection: SocketStream, payload: Record<string, unknown>): void {
  if (connection.socket.readyState === connection.socket.OPEN) {
    connection.socket.send(JSON.stringify(payload));
  }
}

export function registerInboxWebSocket(
  app: FastifyInstance,
  config: TeamInboxConfig,
): void {
  app.get(
    '/inbox/ws',
    { websocket: true },
    async (connection: SocketStream, request: FastifyRequest) => {
      const token = (request.query as Record<string, string>)['token'];
      if (!token || !config.jwtPublicKey) {
        send(connection, { type: 'error', message: 'Authentication required' });
        connection.socket.close(1008, 'Unauthorized');
        return;
      }

      let userId: string;
      let tenantId: string;

      try {
        const payload = verifyJwt(token, config.jwtPublicKey);
        userId = payload.user_id;
        tenantId = payload.tenant_id;
      } catch {
        send(connection, { type: 'error', message: 'Invalid or expired token' });
        connection.socket.close(1008, 'Unauthorized');
        return;
      }

      registerClient({ userId, tenantId, connection });

      send(connection, { type: 'connected', user_id: userId, tenant_id: tenantId });

      connection.socket.on('close', () => {
        unregisterClient(tenantId, userId);
      });

      connection.socket.on('error', (err: Error) => {
        app.log.error({ err }, 'Inbox WebSocket error');
        unregisterClient(tenantId, userId);
      });
    },
  );
}
