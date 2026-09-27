import Fastify, { type FastifyInstance } from 'fastify';
import type { ResellerConfig } from './config.js';
import './types.js';
import { ResellerService } from './reseller.service.js';
import { registerResellerRoutes } from './routes/reseller.js';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';

export function createResellerServer(config: ResellerConfig): FastifyInstance {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  const resellerService = new ResellerService(config.kafkaBrokers);

  // Health check — no auth required
  app.get('/health', async (_request, reply) => {
    await reply.status(200).send({
      status: 'ok',
      service: 'reseller',
      timestamp: new Date().toISOString(),
    });
  });

  // JWT auth middleware — skip for health and public branding endpoint
  if (config.jwtPublicKey) {
    const jwtMiddleware = createJwtAuthMiddleware(config.jwtPublicKey);
    app.addHook('preHandler', async (request, reply) => {
      if (request.url === '/health') return;
      // Check for skipAuth config flag (used by GET /reseller/branding/:domain)
      const routeConfig = (request.routeOptions as { config?: { skipAuth?: boolean } }).config;
      if (routeConfig?.skipAuth) return;
      await jwtMiddleware(request, reply);
    });
  }

  registerResellerRoutes(app, resellerService);

  return app;
}

export async function startResellerServer(config: ResellerConfig): Promise<FastifyInstance> {
  const app = createResellerServer(config);
  await app.listen({ port: config.port, host: config.host });
  return app;
}
