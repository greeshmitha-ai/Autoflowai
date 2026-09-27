import Fastify, { type FastifyInstance } from 'fastify';
import type { PortalConfig } from './config.js';
import './types.js';
import { registerPortalRoutes } from './routes/portal.js';
import { createPortalJwtMiddleware } from './middleware/portal-jwt-auth.js';

// Auth-free paths
const PUBLIC_PATHS = new Set([
  '/health',
  '/portal/auth/magic-link',
  '/portal/auth/verify',
  '/portal/auth/login',
]);

export function createPortalServer(config: PortalConfig): FastifyInstance {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  // Health check
  app.get('/health', async (_request, reply) => {
    await reply.status(200).send({
      status: 'ok',
      service: 'portal',
      timestamp: new Date().toISOString(),
    });
  });

  // Portal JWT auth middleware (skip public paths)
  const jwtMiddleware = createPortalJwtMiddleware(config.jwtSecret);
  app.addHook('preHandler', async (request, reply) => {
    if (PUBLIC_PATHS.has(request.url.split('?')[0] ?? '')) return;
    await jwtMiddleware(request, reply);
  });

  registerPortalRoutes(app, config.jwtSecret);

  return app;
}

export async function startPortalServer(config: PortalConfig): Promise<FastifyInstance> {
  const app = createPortalServer(config);
  await app.listen({ port: config.port, host: config.host });
  return app;
}
