import Fastify, { type FastifyInstance } from 'fastify';
import type { CrmConfig } from './config.js';
import './types.js';
import { registerCrmRoutes } from './routes/crm.js';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';

export function createCrmServer(config: CrmConfig): FastifyInstance {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  // Health check — no auth required
  app.get('/health', async (_request, reply) => {
    await reply.status(200).send({
      status: 'ok',
      service: 'crm',
      timestamp: new Date().toISOString(),
    });
  });

  // JWT auth middleware
  if (config.jwtPublicKey) {
    const jwtMiddleware = createJwtAuthMiddleware(config.jwtPublicKey);
    app.addHook('preHandler', async (request, reply) => {
      if (request.url === '/health') return;
      await jwtMiddleware(request, reply);
    });
  }

  registerCrmRoutes(app, config);

  return app;
}

export async function startCrmServer(config: CrmConfig): Promise<FastifyInstance> {
  const app = createCrmServer(config);
  await app.listen({ port: config.port, host: config.host });
  return app;
}
