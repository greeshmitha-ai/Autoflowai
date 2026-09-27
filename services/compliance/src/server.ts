import Fastify, { type FastifyInstance } from 'fastify';
import type { ComplianceConfig } from './config.js';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';
import { registerAuditMiddleware } from './middleware/audit.middleware.js';
import { registerExportRoutes } from './routes/export.js';
import { registerRetentionRoutes } from './routes/retention.js';

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
  return url === '/health';
}

export function createComplianceServer(config: ComplianceConfig): FastifyInstance {
  const app = Fastify({ logger: true });

  // Health check
  app.get('/health', async (_request, reply) => {
    return reply.status(200).send({
      status: 'ok',
      service: 'compliance',
      timestamp: new Date().toISOString(),
    });
  });

  // JWT auth middleware
  if (config.jwtPublicKey) {
    const jwtMiddleware = createJwtAuthMiddleware(config.jwtPublicKey);
    app.addHook('preHandler', async (request, reply) => {
      if (isPublicPath(request.url)) return;
      await jwtMiddleware(request, reply);
    });
  }

  // Audit middleware — records all mutating requests
  registerAuditMiddleware(app);

  registerExportRoutes(app);
  registerRetentionRoutes(app);

  return app;
}

export async function startComplianceServer(config: ComplianceConfig): Promise<FastifyInstance> {
  const app = createComplianceServer(config);
  await app.listen({ port: config.port, host: config.host });
  return app;
}
