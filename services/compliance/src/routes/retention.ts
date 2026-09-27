import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  setRetentionPolicy,
  listRetentionPolicies,
  ValidationError,
} from '../retention.service.js';

export function registerRetentionRoutes(app: FastifyInstance): void {
  // POST /tenants/:id/retention — set retention policy
  app.post(
    '/tenants/:id/retention',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { resource_type: string; retention_days: number };
      }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      if (tenantId !== request.params.id) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      try {
        const policy = await setRetentionPolicy(
          tenantId,
          request.body.resource_type,
          request.body.retention_days,
        );
        return reply.status(201).send(policy);
      } catch (err) {
        if (err instanceof ValidationError) {
          return reply.status(400).send({ error: 'Bad Request', message: err.message });
        }
        throw err;
      }
    },
  );

  // GET /tenants/:id/retention — list retention policies
  app.get(
    '/tenants/:id/retention',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      if (tenantId !== request.params.id) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const policies = await listRetentionPolicies(tenantId);
      return reply.send(policies);
    },
  );
}
