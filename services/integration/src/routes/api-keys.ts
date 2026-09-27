import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  NotFoundError,
  ValidationError,
} from '../api-key.service.js';

export function registerApiKeyRoutes(app: FastifyInstance): void {
  // GET /api-keys — list active API keys
  app.get('/api-keys', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.auth?.tenant_id;
    if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

    const keys = await listApiKeys(tenantId);
    // Never return key_hash in list response
    return reply.send(
      keys.map(({ key_hash: _hash, ...rest }) => rest),
    );
  });

  // POST /api-keys — create API key
  app.post(
    '/api-keys',
    async (
      request: FastifyRequest<{ Body: { name: string; scopes?: string[] } }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        const result = await createApiKey(tenantId, request.body);
        return reply.status(201).send({
          ...result.api_key,
          key_hash: undefined,
          raw_key: result.raw_key, // Only returned on creation
        });
      } catch (err) {
        if (err instanceof ValidationError) {
          return reply.status(400).send({ error: 'Bad Request', message: err.message });
        }
        throw err;
      }
    },
  );

  // DELETE /api-keys/:id — revoke API key
  app.delete(
    '/api-keys/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        await revokeApiKey(tenantId, request.params.id);
        return reply.status(204).send();
      } catch (err) {
        if (err instanceof NotFoundError) return reply.status(404).send({ error: 'Not Found' });
        throw err;
      }
    },
  );
}
