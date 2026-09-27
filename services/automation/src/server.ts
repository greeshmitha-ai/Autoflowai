import Fastify, { type FastifyInstance } from 'fastify';
import type { AutomationConfig } from './config.js';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';
import { registerWorkflowRoutes } from './routes/workflows.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      user_id: string;
      tenant_id: string;
      roles: string[];
    };
  }
}

export function createAutomationServer(config: AutomationConfig): FastifyInstance {
  const app = Fastify({ logger: true, trustProxy: true });

  // Health check — no auth required
  app.get('/health', async (_request, reply) => {
    await reply.status(200).send({
      status: 'ok',
      service: 'automation',
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

  registerWorkflowRoutes(app);

  return app;
}

export async function startAutomationServer(config: AutomationConfig): Promise<FastifyInstance> {
  const app = createAutomationServer(config);
  await app.listen({ port: config.port, host: config.host });
  return app;
}
