import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CampaignService, ValidationError, NotFoundError } from '../campaign.service.js';
import { TrackingService, TRACKING_PIXEL } from '../tracking.service.js';
import type {
  CreateCampaignBody,
  UpdateCampaignBody,
  SendCampaignBody,
  CreateTemplateBody,
  UpdateTemplateBody,
} from '../types.js';
import type { MarketingConfig } from '../config.js';

export function registerCampaignRoutes(app: FastifyInstance, config: MarketingConfig): void {
  const service = new CampaignService(config.kafkaBrokers, config.providerRateLimit, config.batchSize);
  const tracking = new TrackingService(config.kafkaBrokers);

  // ─── Campaigns ─────────────────────────────────────────────────────────────

  // POST /campaigns
  app.post(
    '/campaigns',
    async (request: FastifyRequest<{ Body: CreateCampaignBody }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      const userId = request.auth?.user_id ?? '';
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      if (!request.body.name || !request.body.channel) {
        return reply.status(400).send({ error: 'Bad Request', message: 'name and channel are required' });
      }

      const campaign = await service.createCampaign(tenantId, userId, request.body);
      return reply.status(201).send(campaign);
    },
  );

  // PUT /campaigns/:id
  app.put(
    '/campaigns/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: UpdateCampaignBody }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const campaign = await service.updateCampaign(tenantId, request.params.id, request.body);
      if (!campaign) return reply.status(404).send({ error: 'Not Found' });
      return reply.send(campaign);
    },
  );

  // GET /campaigns/:id/stats
  app.get(
    '/campaigns/:id/stats',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const stats = await service.getCampaignStats(tenantId, request.params.id);
      if (!stats) return reply.status(404).send({ error: 'Not Found' });
      return reply.send(stats);
    },
  );

  // GET /campaigns/:id/report
  app.get(
    '/campaigns/:id/report',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const report = await service.getCampaignReport(tenantId, request.params.id);
      if (!report) return reply.status(404).send({ error: 'Not Found' });
      return reply.send(report);
    },
  );

  // POST /campaigns/:id/send
  app.post(
    '/campaigns/:id/send',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: SendCampaignBody }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        const result = await service.sendCampaign(
          tenantId,
          request.params.id,
          request.body?.scheduled_at,
        );
        return reply.status(202).send(result);
      } catch (err) {
        if (err instanceof NotFoundError) return reply.status(404).send({ error: 'Not Found' });
        if (err instanceof ValidationError) return reply.status(400).send({ error: 'Bad Request', message: err.message });
        throw err;
      }
    },
  );

  // ─── Tracking (no auth required — public pixel/redirect endpoints) ──────────

  // GET /track/open/:campaignId/:contactId — pixel tracking
  app.get(
    '/track/open/:campaignId/:contactId',
    async (
      request: FastifyRequest<{ Params: { campaignId: string; contactId: string }; Querystring: { t?: string } }>,
      reply: FastifyReply,
    ) => {
      const { campaignId, contactId } = request.params;
      // tenantId from query param (embedded in email link)
      const tenantId = (request.query as { t?: string }).t ?? '';

      if (tenantId) {
        void tracking.trackOpen(tenantId, campaignId, contactId).catch(() => {});
      }

      return reply
        .header('Content-Type', 'image/gif')
        .header('Cache-Control', 'no-store, no-cache, must-revalidate')
        .status(200)
        .send(TRACKING_PIXEL);
    },
  );

  // GET /track/click/:campaignId/:contactId — link-wrapping redirect
  app.get(
    '/track/click/:campaignId/:contactId',
    async (
      request: FastifyRequest<{ Params: { campaignId: string; contactId: string }; Querystring: { url?: string; t?: string } }>,
      reply: FastifyReply,
    ) => {
      const { campaignId, contactId } = request.params;
      const qs = request.query as { url?: string; t?: string };
      const tenantId = qs.t ?? '';
      const redirectUrl = qs.url ?? '/';

      if (tenantId) {
        void tracking.trackClick(tenantId, campaignId, contactId).catch(() => {});
      }

      return reply.redirect(302, redirectUrl);
    },
  );

  // POST /track/unsubscribe/:campaignId/:contactId
  app.post(
    '/track/unsubscribe/:campaignId/:contactId',
    async (
      request: FastifyRequest<{ Params: { campaignId: string; contactId: string }; Body: { tenant_id?: string } }>,
      reply: FastifyReply,
    ) => {
      const { campaignId, contactId } = request.params;
      const tenantId = request.body?.tenant_id ?? request.auth?.tenant_id ?? '';

      if (!tenantId) return reply.status(400).send({ error: 'Bad Request', message: 'tenant_id required' });

      await tracking.trackUnsubscribe(tenantId, campaignId, contactId);
      return reply.send({ success: true, message: 'You have been unsubscribed.' });
    },
  );

  // ─── Email Templates ────────────────────────────────────────────────────────

  // GET /templates
  app.get('/templates', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.auth?.tenant_id;
    if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });
    const templates = await service.listTemplates(tenantId);
    return reply.send(templates);
  });

  // POST /templates
  app.post(
    '/templates',
    async (request: FastifyRequest<{ Body: CreateTemplateBody }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      if (!request.body.name) {
        return reply.status(400).send({ error: 'Bad Request', message: 'name is required' });
      }

      const template = await service.createTemplate(tenantId, request.body);
      return reply.status(201).send(template);
    },
  );

  // PUT /templates/:id
  app.put(
    '/templates/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: UpdateTemplateBody }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const template = await service.updateTemplate(tenantId, request.params.id, request.body);
      if (!template) return reply.status(404).send({ error: 'Not Found' });
      return reply.send(template);
    },
  );

  // GET /templates/:id
  app.get(
    '/templates/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const template = await service.getTemplate(tenantId, request.params.id);
      if (!template) return reply.status(404).send({ error: 'Not Found' });
      return reply.send(template);
    },
  );
}
