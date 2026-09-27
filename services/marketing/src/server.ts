import Fastify, { type FastifyInstance } from 'fastify';
import type { MarketingConfig } from './config.js';
import { registerCampaignRoutes } from './routes/campaigns.js';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';

export function createMarketingServer(config: MarketingConfig): FastifyInstance {
  const app = Fastify({ logger: true, trustProxy: true });

  // Health check — no auth required
  app.get('/health', async (_request, reply) => {
    await reply.status(200).send({
      status: 'ok',
      service: 'marketing',
      timestamp: new Date().toISOString(),
    });
  });

  // JWT auth middleware for all non-health, non-tracking routes
  if (config.jwtPublicKey) {
    const jwtMiddleware = createJwtAuthMiddleware(config.jwtPublicKey);
    app.addHook('preHandler', async (request, reply) => {
      if (request.url === '/health') return;
      // Tracking endpoints are public (pixel/redirect/unsubscribe)
      if (request.url.startsWith('/track/')) return;
      await jwtMiddleware(request, reply);
    });
  }

  registerCampaignRoutes(app, config);

  return app;
}

export async function startMarketingServer(config: MarketingConfig): Promise<FastifyInstance> {
  const app = createMarketingServer(config);
  await app.listen({ port: config.port, host: config.host });
  return app;
}
