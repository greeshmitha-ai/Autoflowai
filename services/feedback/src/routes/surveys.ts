import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createSurvey,
  getSurvey,
  listSurveys,
  publishSurvey,
  submitResponse,
  getSurveyResults,
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../survey.service.js';
import { analyseSentiment, extractOpenTextAnswers } from '../sentiment.js';
import { extractNpsScore } from '../nps.js';
import { publishLowScoreEvent } from '../dispatch.consumer.js';
import { generateCsv, generatePdf } from '../export.js';
import type { FeedbackConfig } from '../config.js';

export function registerSurveyRoutes(app: FastifyInstance, config: FeedbackConfig): void {
  // ── POST /surveys — create survey ─────────────────────────────────────────
  app.post(
    '/surveys',
    async (
      request: FastifyRequest<{ Body: { name: string; questions?: unknown[] } }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        const survey = await createSurvey(tenantId, request.body);
        return reply.status(201).send(survey);
      } catch (err) {
        if (err instanceof ValidationError)
          return reply.status(400).send({ error: 'Bad Request', message: err.message });
        throw err;
      }
    },
  );

  // ── GET /surveys — list surveys ────────────────────────────────────────────
  app.get('/surveys', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.auth?.tenant_id;
    if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

    const list = await listSurveys(tenantId);
    return reply.send(list);
  });

  // ── GET /surveys/:id — get survey ──────────────────────────────────────────
  app.get(
    '/surveys/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        const survey = await getSurvey(tenantId, request.params.id);
        return reply.send(survey);
      } catch (err) {
        if (err instanceof NotFoundError) return reply.status(404).send({ error: 'Not Found' });
        throw err;
      }
    },
  );

  // ── POST /surveys/:id/publish — publish survey ─────────────────────────────
  app.post(
    '/surveys/:id/publish',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        const survey = await publishSurvey(tenantId, request.params.id, config.publicBaseUrl);
        return reply.send(survey);
      } catch (err) {
        if (err instanceof NotFoundError) return reply.status(404).send({ error: 'Not Found' });
        if (err instanceof ConflictError)
          return reply.status(409).send({ error: 'Conflict', message: err.message });
        throw err;
      }
    },
  );

  // ── POST /surveys/:id/responses — public endpoint (no auth) ───────────────
  app.post(
    '/surveys/:id/responses',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { contact_id?: string; answers: Record<string, unknown> };
      }>,
      reply: FastifyReply,
    ) => {
      const { id: surveyId } = request.params;
      const { contact_id, answers } = request.body;

      if (!answers || typeof answers !== 'object') {
        return reply.status(400).send({ error: 'Bad Request', message: 'answers is required' });
      }

      try {
        // Async sentiment analysis — run before storing so we can tag immediately
        const openText = extractOpenTextAnswers(answers);
        const sentiment = await analyseSentiment(openText);

        const response = await submitResponse(surveyId, {
          contact_id: contact_id ?? null,
          answers,
          sentiment,
        });

        // Async: publish low-score event if applicable (fire-and-forget)
        const npsScore = extractNpsScore(answers);
        if (npsScore !== null && npsScore <= 6) {
          void publishLowScoreEvent(
            response.tenant_id,
            surveyId,
            response.response_id,
            contact_id ?? null,
            npsScore,
            config,
          ).catch((err) => app.log.error({ err }, 'Failed to publish low-score event'));
        }

        return reply.status(201).send(response);
      } catch (err) {
        if (err instanceof NotFoundError) return reply.status(404).send({ error: 'Not Found' });
        if (err instanceof ConflictError)
          return reply.status(409).send({ error: 'Conflict', message: err.message });
        throw err;
      }
    },
  );

  // ── GET /surveys/:id/results — aggregated results + NPS ───────────────────
  app.get(
    '/surveys/:id/results',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        const results = await getSurveyResults(tenantId, request.params.id);
        return reply.send(results);
      } catch (err) {
        if (err instanceof NotFoundError) return reply.status(404).send({ error: 'Not Found' });
        throw err;
      }
    },
  );

  // ── GET /surveys/:id/export?format=csv|pdf ─────────────────────────────────
  app.get(
    '/surveys/:id/export',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Querystring: { format?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const format = request.query.format ?? 'csv';

      if (format !== 'csv' && format !== 'pdf') {
        return reply.status(400).send({ error: 'Bad Request', message: 'format must be csv or pdf' });
      }

      try {
        const survey = await getSurvey(tenantId, request.params.id);
        const results = await getSurveyResults(tenantId, request.params.id);

        if (format === 'csv') {
          const csv = generateCsv(results);
          return reply
            .status(200)
            .header('Content-Type', 'text/csv')
            .header('Content-Disposition', `attachment; filename="survey-${request.params.id}.csv"`)
            .send(csv);
        }

        // PDF
        const pdfBuffer = await generatePdf(survey.name, results);
        return reply
          .status(200)
          .header('Content-Type', 'application/pdf')
          .header('Content-Disposition', `attachment; filename="survey-${request.params.id}.pdf"`)
          .send(pdfBuffer);
      } catch (err) {
        if (err instanceof NotFoundError) return reply.status(404).send({ error: 'Not Found' });
        throw err;
      }
    },
  );
}
