import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import type { TeamInboxConfig } from './config.js';
import './types.js';
import { registerInboxRoutes } from './routes/inbox.js';
import { registerInboxWebSocket } from './routes/inbox.ws.js';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';

export function createTeamInboxServer(config: TeamInboxConfig): FastifyInstance {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  void app.register(websocket);

  // Health check — no auth required
  app.get('/health', async (_request, reply) => {
    await reply.status(200).send({
      status: 'ok',
      service: 'team-inbox',
      timestamp: new Date().toISOString(),
    });
  });

  // JWT auth middleware — skip for health and WS (WS handles its own auth)
  if (config.jwtPublicKey) {
    const jwtMiddleware = createJwtAuthMiddleware(config.jwtPublicKey);
    app.addHook('preHandler', async (request, reply) => {
      if (request.url === '/health') return;
      if (request.url.startsWith('/inbox/ws')) return;
      const routeConfig = (request.routeOptions as { config?: { skipAuth?: boolean } }).config;
      if (routeConfig?.skipAuth) return;
      await jwtMiddleware(request, reply);
    });
  }

  registerInboxRoutes(app);
  registerInboxWebSocket(app, config);

  return app;
}

export async function startTeamInboxServer(config: TeamInboxConfig): Promise<FastifyInstance> {
  const app = createTeamInboxServer(config);
  await app.listen({ port: config.port, host: config.host });
  return app;
}
