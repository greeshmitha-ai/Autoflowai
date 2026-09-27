import Fastify, { type FastifyInstance } from 'fastify';
import { jwtMiddleware } from './middleware/jwt.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { registerProxyRoutes } from './proxy.js';

export interface GatewayConfig {
  port?: number;
  host?: string;
  trustProxy?: boolean;
  logger?: boolean;
}

/**
 * Creates and configures the API Gateway Fastify instance.
 */
export function createGateway(config: GatewayConfig = {}): FastifyInstance {
  const app = Fastify({
    logger: config.logger ?? true,
    trustProxy: config.trustProxy ?? true,
    // TLS termination is handled at the load balancer / reverse proxy level
    // (nginx/ALB), so the gateway itself runs HTTP internally
  });

  // Health check — no auth required
  app.get('/health', async (_request, reply) => {
    await reply.status(200).send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Apply JWT validation to all routes under /api
  app.addHook('preHandler', async (request, reply) => {
    // Skip auth for health check and public endpoints
    if (
      request.url === '/health' ||
      request.url.startsWith('/auth/') ||
      request.url.startsWith('/surveys/') && request.url.endsWith('/responses') && request.method === 'POST'
    ) {
      return;
    }
    await jwtMiddleware(request, reply);
  });

  // Apply rate limiting after JWT (needs tenant_id from auth context)
  app.addHook('preHandler', async (request, reply) => {
    if (request.url === '/health') return;
    await rateLimitMiddleware(request, reply);
  });

  // Proxy routes to downstream services
  registerProxyRoutes(app);

  return app;
}

export async function startGateway(config: GatewayConfig = {}): Promise<FastifyInstance> {
  const app = createGateway(config);
  const port = config.port ?? parseInt(process.env['PORT'] ?? '3000', 10);
  const host = config.host ?? process.env['HOST'] ?? '0.0.0.0';

  await app.listen({ port, host });
  return app;
}
