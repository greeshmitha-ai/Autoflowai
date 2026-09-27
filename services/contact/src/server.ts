import Fastify, { type FastifyInstance } from 'fastify';
import type { ContactConfig } from './config.js';
import { getElasticsearchClient, ensureContactsIndex } from './elasticsearch.js';
import { registerContactRoutes } from './routes/contacts.js';
import { createJwtAuthMiddleware } from './middleware/jwt-auth.js';
import { startPiiErasureCron } from './pii-erasure.cron.js';

export function createContactServer(config: ContactConfig): FastifyInstance {
  const app = Fastify({
    logger: true,
    trustProxy: true,
    bodyLimit: 50 * 1024 * 1024, // 50MB for CSV uploads
  });

  const esClient = getElasticsearchClient(config.elasticsearchUrl);

  // Health check — no auth required
  app.get('/health', async (_request, reply) => {
    await reply.status(200).send({
      status: 'ok',
      service: 'contact',
      timestamp: new Date().toISOString(),
    });
  });

  // JWT auth middleware for all non-health routes
  if (config.jwtPublicKey) {
    const jwtMiddleware = createJwtAuthMiddleware(config.jwtPublicKey);
    app.addHook('preHandler', async (request, reply) => {
      if (request.url === '/health') return;
      await jwtMiddleware(request, reply);
    });
  }

  // Register contact routes
  registerContactRoutes(app, config, esClient);

  // Ensure Elasticsearch index exists on startup
  app.addHook('onReady', async () => {
    try {
      await ensureContactsIndex(esClient);
    } catch (err) {
      app.log.warn({ err }, 'Failed to ensure Elasticsearch index');
    }
  });

  return app;
}

export async function startContactServer(config: ContactConfig): Promise<FastifyInstance> {
  const app = createContactServer(config);
  const esClient = getElasticsearchClient(config.elasticsearchUrl);

  // Start PII erasure cron job
  startPiiErasureCron(esClient, config.kafkaBrokers);

  await app.listen({ port: config.port, host: config.host });
  return app;
}
