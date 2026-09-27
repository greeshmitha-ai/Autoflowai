/**
 * Export Service — standalone Fastify app.
 * Handles PDF/PNG export of dashboards and reports via Puppeteer.
 * Requirements: 32.1, 32.2
 */
import Fastify from 'fastify';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';
import { registerExportRoutes } from './routes/exports.js';

const PORT = parseInt(process.env['PORT'] ?? '3020', 10);
const HOST = process.env['HOST'] ?? '0.0.0.0';
const JWT_PUBLIC_KEY = process.env['JWT_PUBLIC_KEY'] ?? '';

async function start(): Promise<void> {
  const app = Fastify({ logger: true });

  // JWT auth on all routes
  if (JWT_PUBLIC_KEY) {
    app.addHook('preHandler', createJwtAuthMiddleware(JWT_PUBLIC_KEY));
  } else {
    // Dev fallback: inject a dummy auth context
    app.addHook('preHandler', async (request) => {
      if (!request.auth) {
        request.auth = {
          user_id: 'dev-user',
          tenant_id: 'dev-tenant',
          roles: ['admin'],
        };
      }
    });
  }

  registerExportRoutes(app);

  // Health check
  app.get('/health', async () => ({ status: 'ok', service: 'export' }));

  await app.listen({ port: PORT, host: HOST });
  app.log.info(`Export Service listening on ${HOST}:${PORT}`);
}

start().catch((err) => {
  console.error('Failed to start Export Service', err);
  process.exit(1);
});
