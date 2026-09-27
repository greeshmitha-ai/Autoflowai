import Fastify, { type FastifyInstance } from 'fastify';
import type { LeadScorerConfig } from './config.js';
import './types.js';
import { LeadScorerService } from './lead-scorer.service.js';
import { registerLeadScoreRoutes } from './routes/lead-scores.js';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';

export function createLeadScorerServer(config: LeadScorerConfig): FastifyInstance {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  const service = new LeadScorerService();

  // Health check — no auth required
  app.get('/health', async (_request, reply) => {
    await reply.status(200).send({
      status: 'ok',
      service: 'lead-scorer',
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

  registerLeadScoreRoutes(app, service);

  return app;
}

export async function startLeadScorerServer(config: LeadScorerConfig): Promise<FastifyInstance> {
  const app = createLeadScorerServer(config);
  await app.listen({ port: config.port, host: config.host });
  return app;
}
