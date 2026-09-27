import Fastify, { type FastifyInstance } from 'fastify';
import type { TasksConfig } from './config.js';
import './types.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';

export function createTasksServer(config: TasksConfig): FastifyInstance {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  // Health check — no auth required
  app.get('/health', async (_request, reply) => {
    await reply.status(200).send({
      status: 'ok',
      service: 'tasks',
      timestamp: new Date().toISOString(),
    });
  });

  // JWT auth middleware — skip for public endpoints and health
  if (config.jwtPublicKey) {
    const jwtMiddleware = createJwtAuthMiddleware(config.jwtPublicKey);
    app.addHook('preHandler', async (request, reply) => {
      // Skip auth for health check and routes marked skipAuth
      if (request.url === '/health') return;
      const routeConfig = (request.routeOptions as { config?: { skipAuth?: boolean } }).config;
      if (routeConfig?.skipAuth) return;
      await jwtMiddleware(request, reply);
    });
  }

  registerTaskRoutes(app, config);

  return app;
}

export async function startTasksServer(config: TasksConfig): Promise<FastifyInstance> {
  const app = createTasksServer(config);
  await app.listen({ port: config.port, host: config.host });
  return app;
}
