import type { FastifyInstance } from 'fastify';
import {
  listInboxConversations,
  assignConversation,
  updateConversationStatus,
  NotFoundError,
  ValidationError,
  type InboxChannel,
  type InboxStatus,
  type ListInboxQuery,
} from '../inbox.service.js';
import { broadcastToTenant } from '../ws-registry.js';
import '../types.js';

export function registerInboxRoutes(app: FastifyInstance): void {
  // GET /inbox — list conversations with optional filters
  app.get<{
    Querystring: {
      channel?: string;
      status?: string;
      assigned_to?: string;
      q?: string;
      from?: string;
      to?: string;
    };
  }>('/inbox', async (request, reply) => {
    const { tenant_id } = request.auth;
    const { channel, status, assigned_to, q, from, to } = request.query;

    const query: ListInboxQuery = {};
    if (channel) query.channel = channel as InboxChannel;
    if (status) query.status = status as InboxStatus;
    if (assigned_to) query.assigned_to = assigned_to;
    if (q) query.q = q;
    if (from) query.from = from;
    if (to) query.to = to;

    try {
      const conversations = await listInboxConversations(tenant_id, query);

      const now = Date.now();
      const result = conversations.map((c) => ({
        inbox_id: c.inbox_id,
        channel: c.channel,
        contact_id: c.contact_id,
        contact_name: c.contact_name,
        last_message_preview: c.last_message_preview,
        last_message_at: c.last_message_at,
        time_since_last_message_ms: c.last_message_at
          ? now - c.last_message_at.getTime()
          : null,
        assigned_to: c.assigned_to,
        status: c.status,
        created_at: c.created_at,
      }));

      await reply.status(200).send({ conversations: result });
    } catch (err) {
      app.log.error(err, 'Failed to list inbox conversations');
      await reply.status(500).send({ error: 'Failed to list inbox conversations' });
    }
  });

  // POST /inbox/:id/assign — assign conversation to a user
  app.post<{
    Params: { id: string };
    Body: { user_id: string };
  }>('/inbox/:id/assign', async (request, reply) => {
    const { tenant_id } = request.auth;
    const { id: inboxId } = request.params;
    const { user_id } = request.body;

    try {
      const updated = await assignConversation(tenant_id, inboxId, user_id);

      // Broadcast real-time update
      broadcastToTenant(tenant_id, {
        type: 'conversation_assigned',
        inbox_id: updated.inbox_id,
        assigned_to: updated.assigned_to,
      });

      await reply.status(200).send(updated);
    } catch (err) {
      if (err instanceof NotFoundError) {
        await reply.status(404).send({ error: err.message });
      } else if (err instanceof ValidationError) {
        await reply.status(400).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to assign conversation');
        await reply.status(500).send({ error: 'Failed to assign conversation' });
      }
    }
  });

  // POST /inbox/:id/status — update conversation status
  app.post<{
    Params: { id: string };
    Body: { status: string };
  }>('/inbox/:id/status', async (request, reply) => {
    const { tenant_id } = request.auth;
    const { id: inboxId } = request.params;
    const { status } = request.body;

    try {
      const updated = await updateConversationStatus(
        tenant_id,
        inboxId,
        status as InboxStatus,
      );

      // Broadcast real-time update
      broadcastToTenant(tenant_id, {
        type: 'conversation_status_changed',
        inbox_id: updated.inbox_id,
        status: updated.status,
      });

      await reply.status(200).send(updated);
    } catch (err) {
      if (err instanceof NotFoundError) {
        await reply.status(404).send({ error: err.message });
      } else if (err instanceof ValidationError) {
        await reply.status(400).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to update conversation status');
        await reply.status(500).send({ error: 'Failed to update conversation status' });
      }
    }
  });
}
