import Fastify, { type FastifyInstance } from 'fastify';
import type { BillingConfig } from './config.js';
import './types.js';
import { BillingService } from './billing.service.js';
import { registerBillingRoutes } from './routes/billing.js';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';

export function createBillingServer(config: BillingConfig): FastifyInstance {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  const billingService = new BillingService(config.stripeSecretKey, config.kafkaBrokers);

  // Health check — no auth required
  app.get('/health', async (_request, reply) => {
    await reply.status(200).send({
      status: 'ok',
      service: 'billing',
      timestamp: new Date().toISOString(),
    });
  });

  // JWT auth middleware — skip for webhook and health endpoints
  if (config.jwtPublicKey) {
    const jwtMiddleware = createJwtAuthMiddleware(config.jwtPublicKey);
    app.addHook('preHandler', async (request, reply) => {
      if (request.url === '/health') return;
      if (request.url === '/billing/webhook') return;
      // Check for skipAuth config flag
      const routeConfig = (request.routeOptions as { config?: { skipAuth?: boolean } }).config;
      if (routeConfig?.skipAuth) return;
      await jwtMiddleware(request, reply);
    });
  }

  registerBillingRoutes(app, config, billingService);

  return app;
}

export async function startBillingServer(config: BillingConfig): Promise<FastifyInstance> {
  const app = createBillingServer(config);
  await app.listen({ port: config.port, host: config.host });
  return app;
}
