import Fastify, { type FastifyInstance } from 'fastify';
import type { MarketplaceConfig } from './config.js';
import './types.js';
import { registerMarketplaceRoutes } from './routes/marketplace.js';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';

export function createMarketplaceServer(config: MarketplaceConfig): FastifyInstance {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  // Health check — no auth required
  app.get('/health', async (_request, reply) => {
    await reply.status(200).send({
      status: 'ok',
      service: 'marketplace',
      timestamp: new Date().toISOString(),
    });
  });

  // JWT auth middleware (skip for /health and public listing)
  if (config.jwtPublicKey) {
    const jwtMiddleware = createJwtAuthMiddleware(config.jwtPublicKey);
    app.addHook('preHandler', async (request, reply) => {
      // Public routes: health check and GET listing/detail don't require auth
      if (request.url === '/health') return;
      if (request.method === 'GET' && request.url.startsWith('/marketplace/extensions')) return;
      await jwtMiddleware(request, reply);
    });
  }

  registerMarketplaceRoutes(app);

  return app;
}

export async function startMarketplaceServer(
  config: MarketplaceConfig,
): Promise<FastifyInstance> {
  const app = createMarketplaceServer(config);
  await app.listen({ port: config.port, host: config.host });
  return app;
}
