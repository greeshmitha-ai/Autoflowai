import Fastify, { type FastifyInstance } from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyMultipart from '@fastify/multipart';
import type { ChatbotConfig } from './config.js';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';
import { createAiAdapter } from './ai-adapter.js';
import { registerAgentRoutes } from './routes/agents.js';
import { registerChatWebSocket } from './routes/chat.ws.js';
import { registerChannelRoutes } from './routes/channels.js';

// Extend FastifyRequest with auth context (same pattern as other services)
declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      user_id: string;
      tenant_id: string;
      roles: string[];
    };
  }
}

export function createChatbotServer(config: ChatbotConfig): FastifyInstance {
  const app = Fastify({ logger: true, trustProxy: true });

  // Register plugins
  void app.register(fastifyWebsocket);
  void app.register(fastifyMultipart, {
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  });

  const ai = createAiAdapter(config.aiProvider, config.aiApiKey, config.aiModel);

  // Health check — no auth required
  app.get('/health', async (_request, reply) => {
    await reply.status(200).send({
      status: 'ok',
      service: 'chatbot',
      timestamp: new Date().toISOString(),
    });
  });

  // JWT auth middleware — skip health, widget.js, webhooks, and /chat WebSocket
  if (config.jwtPublicKey) {
    const jwtMiddleware = createJwtAuthMiddleware(config.jwtPublicKey);
    app.addHook('preHandler', async (request, reply) => {
      const url = request.url.split('?')[0] ?? '';
      if (
        url === '/health' ||
        url === '/widget.js' ||
        url === '/chat' ||
        url.startsWith('/webhooks/')
      ) {
        return;
      }
      await jwtMiddleware(request, reply);
    });
  }

  // Register routes
  registerAgentRoutes(app, config);
  registerChatWebSocket(app, ai, config);
  registerChannelRoutes(app, ai, config);

  return app;
}

export async function startChatbotServer(config: ChatbotConfig): Promise<FastifyInstance> {
  const app = createChatbotServer(config);
  await app.listen({ port: config.port, host: config.host });
  return app;
}
