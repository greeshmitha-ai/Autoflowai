import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import type { NotificationConfig } from './config.js';
import './types.js';
import { registerNotificationRoutes } from './routes/notifications.js';
import { registerNotificationWebSocket } from './routes/notifications.ws.js';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';

export function createNotificationServer(config: NotificationConfig): FastifyInstance {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  void app.register(websocket);

  // Health check — no auth required
  app.get('/health', async (_request, reply) => {
    await reply.status(200).send({
      status: 'ok',
      service: 'notification',
      timestamp: new Date().toISOString(),
    });
  });

  // JWT auth middleware — skip for health and WS (WS handles its own auth)
  if (config.jwtPublicKey) {
    const jwtMiddleware = createJwtAuthMiddleware(config.jwtPublicKey);
    app.addHook('preHandler', async (request, reply) => {
      if (request.url === '/health') return;
      if (request.url.startsWith('/notifications/ws')) return;
      await jwtMiddleware(request, reply);
    });
  }

  registerNotificationRoutes(app);
  registerNotificationWebSocket(app, config);

  return app;
}

export async function startNotificationServer(
  config: NotificationConfig,
): Promise<FastifyInstance> {
  const app = createNotificationServer(config);
  await app.listen({ port: config.port, host: config.host });
  return app;
}
