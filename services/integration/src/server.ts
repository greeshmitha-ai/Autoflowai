import Fastify, { type FastifyInstance } from 'fastify';
import type { IntegrationConfig } from './config.js';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';
import { registerApiKeyRoutes } from './routes/api-keys.js';
import { registerWebhookRoutes } from './routes/webhooks.js';
import { registerIntegrationRoutes } from './routes/integrations.js';
import { openapiSpec } from './openapi.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      user_id: string;
      tenant_id: string;
      roles: string[];
    };
  }
}

function isPublicPath(url: string): boolean {
  return url === '/health' || url === '/api/openapi.json';
}

export function createIntegrationServer(config: IntegrationConfig): FastifyInstance {
  const app = Fastify({ logger: true });

  // Health check
  app.get('/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      service: 'integration',
      timestamp: new Date().toISOString(),
    });
  });

  // OpenAPI spec — public, no auth required
  app.get('/api/openapi.json', async (_request, reply) => {
    return reply.header('Content-Type', 'application/json').send(openapiSpec);
  });

  // JWT auth middleware
  if (config.jwtPublicKey) {
    const jwtMiddleware = createJwtAuthMiddleware(config.jwtPublicKey);
    app.addHook('preHandler', async (request, reply) => {
      if (isPublicPath(request.url)) return;
      await jwtMiddleware(request, reply);
    });
  }

  registerApiKeyRoutes(app);
  registerWebhookRoutes(app);
  registerIntegrationRoutes(app);

  return app;
}

export async function startIntegrationServer(
  config: IntegrationConfig,
): Promise<FastifyInstance> {
  const app = createIntegrationServer(config);
  await app.listen({ port: config.port, host: config.host });
  return app;
}
