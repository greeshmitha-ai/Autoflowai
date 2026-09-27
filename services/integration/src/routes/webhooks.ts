import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  registerWebhook,
  listWebhooks,
  getWebhookDeliveries,
  NotFoundError,
  ValidationError,
} from '../webhook.service.js';

export function registerWebhookRoutes(app: FastifyInstance): void {
  // POST /webhooks — register webhook
  app.post(
    '/webhooks',
    async (
      request: FastifyRequest<{ Body: { url: string; events: string[] } }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        const webhook = await registerWebhook(tenantId, request.body);
        // Return webhook but omit secret from response
        const { secret: _secret, ...rest } = webhook;
        return reply.status(201).send(rest);
      } catch (err) {
        if (err instanceof ValidationError) {
          return reply.status(400).send({ error: 'Bad Request', message: err.message });
        }
        throw err;
      }
    },
  );

  // GET /webhooks — list webhooks
  app.get('/webhooks', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.auth?.tenant_id;
    if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

    const list = await listWebhooks(tenantId);
    return reply.send(list.map(({ secret: _s, ...rest }) => rest));
  });

  // GET /webhooks/:id/deliveries — delivery log
  app.get(
    '/webhooks/:id/deliveries',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        const deliveries = await getWebhookDeliveries(tenantId, request.params.id);
        return reply.send(deliveries);
      } catch (err) {
        if (err instanceof NotFoundError) return reply.status(404).send({ error: 'Not Found' });
        throw err;
      }
    },
  );
}
