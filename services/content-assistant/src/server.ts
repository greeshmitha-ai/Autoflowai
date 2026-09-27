import Fastify, { type FastifyInstance } from 'fastify';
import type { ContentAssistantConfig } from './config.js';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';
import { createContentAiAdapter } from './ai-adapter.js';
import { registerContentRoutes } from './routes/content.js';

// Extend FastifyRequest with auth context
declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      user_id: string;
      tenant_id: string;
      roles: string[];
    };
  }
}

export function createContentAssistantServer(config: ContentAssistantConfig): FastifyInstance {
  const app = Fastify({ logger: true, trustProxy: true });

  const ai = createContentAiAdapter(config.aiProvider, config.aiApiKey, config.aiModel);

  // Health check — no auth required
  app.get('/health', async (_request, reply) => {
    await reply.status(200).send({
      status: 'ok',
      service: 'content-assistant',
      timestamp: new Date().toISOString(),
    });
  });

  // JWT auth middleware — skip health check
  if (config.jwtPublicKey) {
    const jwtMiddleware = createJwtAuthMiddleware(config.jwtPublicKey);
    app.addHook('preHandler', async (request, reply) => {
      const url = request.url.split('?')[0] ?? '';
      if (url === '/health') return;
      await jwtMiddleware(request, reply);
    });
  }

  // Register content generation routes
  registerContentRoutes(app, ai, config);

  return app;
}

export async function startContentAssistantServer(
  config: ContentAssistantConfig,
): Promise<FastifyInstance> {
  const app = createContentAssistantServer(config);
  await app.listen({ port: config.port, host: config.host });
  return app;
}
