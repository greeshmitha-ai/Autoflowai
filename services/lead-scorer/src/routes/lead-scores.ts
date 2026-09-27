import type { FastifyInstance } from 'fastify';
import { LeadScorerService, NotFoundError } from '../lead-scorer.service.js';
import '../types.js';

export function registerLeadScoreRoutes(
  app: FastifyInstance,
  service: LeadScorerService,
): void {
  /**
   * GET /contacts/:id/lead-score-explanation
   * Returns current score, confidence, top-3 factors, and last 10 history entries.
   * (Task 17.4 — endpoint on the lead scorer service)
   */
  app.get<{ Params: { id: string } }>(
    '/contacts/:id/lead-score-explanation',
    async (request, reply) => {
      const { tenant_id } = request.auth;
      const { id } = request.params;

      try {
        const explanation = await service.getExplanation(tenant_id, id);
        if (!explanation) {
          await reply.status(404).send({ error: 'Contact not found' });
          return;
        }
        await reply.status(200).send(explanation);
      } catch (err) {
        app.log.error(err, 'Failed to get lead score explanation');
        await reply.status(500).send({ error: 'Failed to retrieve lead score explanation' });
      }
    },
  );

  /**
   * GET /lead-scores/:contactId/explanation
   * Alias endpoint (Task 17.5) — same response shape.
   */
  app.get<{ Params: { contactId: string } }>(
    '/lead-scores/:contactId/explanation',
    async (request, reply) => {
      const { tenant_id } = request.auth;
      const { contactId } = request.params;

      try {
        const explanation = await service.getExplanation(tenant_id, contactId);
        if (!explanation) {
          await reply.status(404).send({ error: 'Contact not found' });
          return;
        }
        await reply.status(200).send(explanation);
      } catch (err) {
        app.log.error(err, 'Failed to get lead score explanation');
        await reply.status(500).send({ error: 'Failed to retrieve lead score explanation' });
      }
    },
  );

  /**
   * POST /lead-scores/:contactId/recalculate
   * Manually trigger a score recalculation for a contact.
   */
  app.post<{ Params: { contactId: string } }>(
    '/lead-scores/:contactId/recalculate',
    async (request, reply) => {
      const { tenant_id } = request.auth;
      const { contactId } = request.params;

      try {
        await service.recalculateScore(tenant_id, contactId);
        const explanation = await service.getExplanation(tenant_id, contactId);
        if (!explanation) {
          await reply.status(404).send({ error: 'Contact not found' });
          return;
        }
        await reply.status(200).send(explanation);
      } catch (err) {
        app.log.error(err, 'Failed to recalculate lead score');
        await reply.status(500).send({ error: 'Failed to recalculate lead score' });
      }
    },
  );
}
