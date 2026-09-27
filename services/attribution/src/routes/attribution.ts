/**
 * Attribution Engine HTTP routes.
 *
 * GET  /attribution/report?model=&from=&to=   — credit by channel/campaign/period
 * POST /attribution/conversions               — define custom conversion event
 * GET  /attribution/touchpoints/:contactId    — list touchpoints for a contact
 * GET  /attribution/metrics                   — available metric definitions
 *
 * Requirements: 24.4, 24.5, 24.6
 */
import type { FastifyInstance } from 'fastify';
import {
  getAttributionReport,
  getContactTouchpoints,
  defineCustomConversionEvent,
  listCustomConversionEvents,
  getAttributionMetrics,
  ValidationError,
  type AttributionModel,
} from '../attribution.service.js';
import '../types.js';

const VALID_MODELS: AttributionModel[] = ['first_touch', 'last_touch', 'linear'];

export function registerAttributionRoutes(app: FastifyInstance): void {
  // ── GET /attribution/report ────────────────────────────────────────────────
  app.get<{
    Querystring: {
      model?: string;
      from?: string;
      to?: string;
    };
  }>('/attribution/report', async (request, reply) => {
    const { tenant_id } = request.auth;
    const { model = 'linear', from, to } = request.query;

    if (!VALID_MODELS.includes(model as AttributionModel)) {
      await reply.status(400).send({
        error: `model must be one of: ${VALID_MODELS.join(', ')}`,
      });
      return;
    }

    const fromDate = from ? new Date(from) : (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d;
    })();

    const toDate = to ? new Date(to) : new Date();

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
      await reply.status(400).send({ error: 'Invalid date format for from or to' });
      return;
    }

    if (fromDate > toDate) {
      await reply.status(400).send({ error: 'from must be before to' });
      return;
    }

    try {
      const report = await getAttributionReport(
        tenant_id,
        model as AttributionModel,
        fromDate,
        toDate,
      );
      await reply.status(200).send(report);
    } catch (err) {
      app.log.error(err, 'Failed to generate attribution report');
      await reply.status(500).send({ error: 'Failed to generate attribution report' });
    }
  });

  // ── POST /attribution/conversions ──────────────────────────────────────────
  app.post<{
    Body: {
      event_type: string;
      description?: string;
    };
  }>('/attribution/conversions', async (request, reply) => {
    const { tenant_id } = request.auth;
    const { event_type, description } = request.body ?? {};

    try {
      const customEvent = await defineCustomConversionEvent(tenant_id, event_type, description);
      await reply.status(201).send(customEvent);
    } catch (err) {
      if (err instanceof ValidationError) {
        await reply.status(400).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to define custom conversion event');
        await reply.status(500).send({ error: 'Failed to define custom conversion event' });
      }
    }
  });

  // ── GET /attribution/conversions ───────────────────────────────────────────
  app.get('/attribution/conversions', async (request, reply) => {
    const { tenant_id } = request.auth;

    try {
      const events = await listCustomConversionEvents(tenant_id);
      await reply.status(200).send({ conversions: events });
    } catch (err) {
      app.log.error(err, 'Failed to list custom conversion events');
      await reply.status(500).send({ error: 'Failed to list custom conversion events' });
    }
  });

  // ── GET /attribution/touchpoints/:contactId ────────────────────────────────
  app.get<{ Params: { contactId: string } }>(
    '/attribution/touchpoints/:contactId',
    async (request, reply) => {
      const { tenant_id } = request.auth;
      const { contactId } = request.params;

      try {
        const tps = await getContactTouchpoints(tenant_id, contactId);
        await reply.status(200).send({ touchpoints: tps });
      } catch (err) {
        app.log.error(err, 'Failed to get touchpoints');
        await reply.status(500).send({ error: 'Failed to get touchpoints' });
      }
    },
  );

  // ── GET /attribution/metrics ───────────────────────────────────────────────
  // Exposes available metric definitions for the Report Builder (Req 24.6)
  app.get('/attribution/metrics', async (_request, reply) => {
    const metrics = getAttributionMetrics();
    await reply.status(200).send({ metrics });
  });
}
