import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import type { LiveChatConfig } from './config.js';
import './types.js';
import { registerLiveChatRoutes } from './routes/live-chat.js';
import { registerLiveChatWebSocket } from './routes/live-chat.ws.js';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';

export function createLiveChatServer(config: LiveChatConfig): FastifyInstance {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  // Register WebSocket plugin
  void app.register(websocket);

  // Health check — no auth required
  app.get('/health', async (_request, reply) => {
    await reply.status(200).send({
      status: 'ok',
      service: 'live-chat',
      timestamp: new Date().toISOString(),
    });
  });

  // JWT auth middleware — skip for health and WS (WS auth is done inside the handler)
  if (config.jwtPublicKey) {
    const jwtMiddleware = createJwtAuthMiddleware(config.jwtPublicKey);
    app.addHook('preHandler', async (request, reply) => {
      if (request.url === '/health') return;
      if (request.url.startsWith('/live-chat/ws')) return; // WS handles its own auth
      const routeConfig = (request.routeOptions as { config?: { skipAuth?: boolean } }).config;
      if (routeConfig?.skipAuth) return;
      await jwtMiddleware(request, reply);
    });
  }

  registerLiveChatRoutes(app, config);
  registerLiveChatWebSocket(app, config);

  return app;
}

export async function startLiveChatServer(config: LiveChatConfig): Promise<FastifyInstance> {
  const app = createLiveChatServer(config);
  await app.listen({ port: config.port, host: config.host });
  return app;
}
