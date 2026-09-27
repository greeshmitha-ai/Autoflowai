import Fastify, { type FastifyInstance } from 'fastify';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';
import { registerReportRoutes } from './routes/reports.js';
import type { ReportsConfig } from './config.js';

export async function startReportsServer(config: ReportsConfig): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });

  // JWT auth on all routes
  app.addHook('onRequest', createJwtAuthMiddleware(config.jwtPublicKey));

  // Register routes
  registerReportRoutes(app);

  // Health check (no auth)
  app.get('/health', { onRequest: [] }, async (_request, reply) => {
    await reply.status(200).send({ status: 'ok', service: 'reports' });
  });

  await app.listen({ port: config.port, host: config.host });
  app.log.info(`Reports service listening on ${config.host}:${config.port}`);

  return app;
}
