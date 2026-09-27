import Fastify, { type FastifyInstance } from 'fastify';
import type { FeedbackConfig } from './config.js';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';
import { registerSurveyRoutes } from './routes/surveys.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      user_id: string;
      tenant_id: string;
      roles: string[];
    };
  }
}

// Public paths that don't require JWT auth
function isPublicPath(url: string): boolean {
  if (url === '/health') return true;
  // Public survey response submission: POST /surveys/:id/responses
  if (/^\/surveys\/[^/]+\/responses$/.test(url)) return true;
  return false;
}

export function createFeedbackServer(config: FeedbackConfig): FastifyInstance {
  const app = Fastify({ logger: true });

  // Health check
  app.get('/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      service: 'feedback',
      timestamp: new Date().toISOString(),
    });
  });

  // JWT auth middleware (skip for public paths)
  if (config.jwtPublicKey) {
    const jwtMiddleware = createJwtAuthMiddleware(config.jwtPublicKey);
    app.addHook('preHandler', async (request, reply) => {
      if (isPublicPath(request.url)) return;
      await jwtMiddleware(request, reply);
    });
  }

  registerSurveyRoutes(app, config);

  return app;
}

export async function startFeedbackServer(config: FeedbackConfig): Promise<FastifyInstance> {
  const app = createFeedbackServer(config);
  await app.listen({ port: config.port, host: config.host });
  return app;
}
