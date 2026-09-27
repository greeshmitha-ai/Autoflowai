import Fastify, { type FastifyInstance } from 'fastify';
import type { AttributionConfig } from './config.js';
import './types.js';
import { registerAttributionRoutes } from './routes/attribution.js';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';

export function createAttributionServer(config: AttributionConfig): FastifyInstance {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  // Health check — no auth required
  app.get('/health', async (_request, reply) => {
    await reply.status(200).send({
      status: 'ok',
      service: 'attribution',
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

  registerAttributionRoutes(app);

  return app;
}

export async function startAttributionServer(
  config: AttributionConfig,
): Promise<FastifyInstance> {
  const app = createAttributionServer(config);
  await app.listen({ port: config.port, host: config.host });
  return app;
}
