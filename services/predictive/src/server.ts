import Fastify, { type FastifyInstance } from 'fastify';
import type { PredictiveConfig } from './config.js';
import './types.js';
import { PredictiveService } from './predictive.service.js';
import { registerInsightRoutes } from './routes/insights.js';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';

export function createPredictiveServer(config: PredictiveConfig): FastifyInstance {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  const service = new PredictiveService();

  // Health check — no auth required
  app.get('/health', async (_request, reply) => {
    await reply.status(200).send({
      status: 'ok',
      service: 'predictive',
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

  registerInsightRoutes(app, service);

  return app;
}

export async function startPredictiveServer(config: PredictiveConfig): Promise<FastifyInstance> {
  const app = createPredictiveServer(config);
  await app.listen({ port: config.port, host: config.host });
  return app;
}
