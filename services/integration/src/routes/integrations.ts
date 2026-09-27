import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createIntegration,
  listIntegrations,
  getIntegration,
  NotFoundError,
  ValidationError,
} from '../integration.service.js';

export function registerIntegrationRoutes(app: FastifyInstance): void {
  // GET /integrations — list integrations
  app.get('/integrations', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.auth?.tenant_id;
    if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

    const list = await listIntegrations(tenantId);
    return reply.send(list);
  });

  // POST /integrations — create integration
  app.post(
    '/integrations',
    async (
      request: FastifyRequest<{
        Body: { provider: string; name: string; config: Record<string, unknown> };
      }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        const integration = await createIntegration(tenantId, request.body);
        return reply.status(201).send(integration);
      } catch (err) {
        if (err instanceof ValidationError) {
          return reply.status(400).send({ error: 'Bad Request', message: err.message });
        }
        throw err;
      }
    },
  );

  // GET /integrations/:id — get integration
  app.get(
    '/integrations/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        const integration = await getIntegration(tenantId, request.params.id);
        return reply.send(integration);
      } catch (err) {
        if (err instanceof NotFoundError) return reply.status(404).send({ error: 'Not Found' });
        throw err;
      }
    },
  );
}
