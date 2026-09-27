import type { FastifyInstance } from 'fastify';
import {
  getSessionContext,
  closeSession,
  createCannedResponse,
  listCannedResponses,
  NotFoundError,
  ValidationError,
} from '../live-chat.service.js';
import type { LiveChatConfig } from '../config.js';
import '../types.js';

export function registerLiveChatRoutes(app: FastifyInstance, _config: LiveChatConfig): void {
  // GET /live-chat/sessions/:id — return session with full context
  app.get<{ Params: { id: string } }>(
    '/live-chat/sessions/:id',
    async (request, reply) => {
      const { tenant_id } = request.auth;
      const { id: sessionId } = request.params;

      try {
        const context = await getSessionContext(tenant_id, sessionId);
        await reply.status(200).send(context);
      } catch (err) {
        if (err instanceof NotFoundError) {
          await reply.status(404).send({ error: err.message });
        } else {
          app.log.error(err, 'Failed to get session context');
          await reply.status(500).send({ error: 'Failed to get session context' });
        }
      }
    },
  );

  // POST /live-chat/sessions/:id/close — close session and store transcript
  app.post<{ Params: { id: string } }>(
    '/live-chat/sessions/:id/close',
    async (request, reply) => {
      const { tenant_id } = request.auth;
      const { id: sessionId } = request.params;

      try {
        const session = await closeSession(tenant_id, sessionId);
        await reply.status(200).send(session);
      } catch (err) {
        if (err instanceof NotFoundError) {
          await reply.status(404).send({ error: err.message });
        } else {
          app.log.error(err, 'Failed to close session');
          await reply.status(500).send({ error: 'Failed to close session' });
        }
      }
    },
  );

  // POST /live-chat/canned-responses — create canned response template
  app.post<{
    Body: { title: string; content: string };
  }>(
    '/live-chat/canned-responses',
    async (request, reply) => {
      const { tenant_id, user_id } = request.auth;
      const { title, content } = request.body;

      try {
        const canned = await createCannedResponse(tenant_id, user_id, { title, content });
        await reply.status(201).send(canned);
      } catch (err) {
        if (err instanceof ValidationError) {
          await reply.status(400).send({ error: err.message });
        } else {
          app.log.error(err, 'Failed to create canned response');
          await reply.status(500).send({ error: 'Failed to create canned response' });
        }
      }
    },
  );

  // GET /live-chat/canned-responses — list canned responses for tenant
  app.get(
    '/live-chat/canned-responses',
    async (request, reply) => {
      const { tenant_id } = request.auth;

      try {
        const responses = await listCannedResponses(tenant_id);
        await reply.status(200).send({ canned_responses: responses });
      } catch (err) {
        app.log.error(err, 'Failed to list canned responses');
        await reply.status(500).send({ error: 'Failed to list canned responses' });
      }
    },
  );
}
