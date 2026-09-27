import Fastify, { type FastifyInstance } from 'fastify';
import type { CallConfig } from './config.js';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';
import { createTwilioClient } from './twilio.client.js';
import { registerCallRoutes } from './routes/calls.js';
import { registerVoiceAiRoutes } from './routes/voice-ai.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: {
      user_id: string;
      tenant_id: string;
      roles: string[];
    };
  }
}

// Paths that don't require JWT auth (Twilio webhooks + TwiML endpoints)
const PUBLIC_PATHS = [
  '/health',
  '/calls/inbound/route',
];

function isPublicPath(url: string): boolean {
  if (PUBLIC_PATHS.includes(url)) return true;
  // Twilio status callbacks and TwiML endpoints
  if (/^\/calls\/[^/]+\/(twiml|status|recording-complete|recording-status|voicemail-complete|voicemail-status|dial-complete|voice-ai\/.*)/.test(url)) return true;
  return false;
}

export function createCallServer(config: CallConfig): FastifyInstance {
  const app = Fastify({ logger: true, trustProxy: true });

  // Health check
  app.get('/health', async (_request, reply) => {
    await reply.status(200).send({
      status: 'ok',
      service: 'call',
      timestamp: new Date().toISOString(),
    });
  });

  // JWT auth middleware (skip for Twilio webhooks)
  if (config.jwtPublicKey) {
    const jwtMiddleware = createJwtAuthMiddleware(config.jwtPublicKey);
    app.addHook('preHandler', async (request, reply) => {
      if (isPublicPath(request.url)) return;
      await jwtMiddleware(request, reply);
    });
  }

  const twilioClient = createTwilioClient(config);
  registerCallRoutes(app, twilioClient, config);
  registerVoiceAiRoutes(app, twilioClient, config);

  return app;
}

export async function startCallServer(config: CallConfig): Promise<FastifyInstance> {
  const app = createCallServer(config);
  await app.listen({ port: config.port, host: config.host });
  return app;
}
