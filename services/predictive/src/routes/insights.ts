import type { FastifyInstance } from 'fastify';
import { PredictiveService } from '../predictive.service.js';
import '../types.js';

export function registerInsightRoutes(
  app: FastifyInstance,
  service: PredictiveService,
): void {
  /**
   * GET /predictive/insights
   * Returns high-risk churn contacts, optimal contact times, and next-best-actions
   * for the authenticated tenant. Results cached in Redis for 24 hours.
   */
  app.get('/predictive/insights', async (request, reply) => {
    const { tenant_id } = request.auth;

    try {
      const insights = await service.getTenantInsights(tenant_id);
      await reply.status(200).send(insights);
    } catch (err) {
      app.log.error(err, 'Failed to get tenant insights');
      await reply.status(500).send({ error: 'Failed to retrieve predictive insights' });
    }
  });

  /**
   * GET /predictive/insights/:contactId
   * Per-contact predictive insights. Results cached in Redis for 24 hours.
   */
  app.get<{ Params: { contactId: string } }>(
    '/predictive/insights/:contactId',
    async (request, reply) => {
      const { tenant_id } = request.auth;
      const { contactId } = request.params;

      try {
        const insights = await service.getContactInsights(tenant_id, contactId);
        if (!insights) {
          await reply.status(404).send({ error: 'Contact not found' });
          return;
        }
        await reply.status(200).send(insights);
      } catch (err) {
        app.log.error(err, 'Failed to get contact insights');
        await reply.status(500).send({ error: 'Failed to retrieve contact insights' });
      }
    },
  );
}
