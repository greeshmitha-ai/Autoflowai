import Fastify, { type FastifyInstance } from 'fastify';
import type { CollaborationConfig } from './config.js';
import './types.js';
import { registerCollaborationRoutes } from './routes/collaboration.js';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';

export function createCollaborationServer(config: CollaborationConfig): FastifyInstance {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  // Health check — no auth required
  app.get('/health', async (_request, reply) => {
    await reply.status(200).send({
      status: 'ok',
      service: 'collaboration',
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

  registerCollaborationRoutes(app, config);

  return app;
}

export async function startCollaborationServer(
  config: CollaborationConfig,
): Promise<FastifyInstance> {
  const app = createCollaborationServer(config);
  await app.listen({ port: config.port, host: config.host });
  return app;
}
