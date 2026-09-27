import type { FastifyInstance } from 'fastify';
import {
  createPipeline,
  createDeal,
  updateDeal,
  getPipelineBoard,
  getPipelineForecast,
  logActivity,
  getDealActivities,
  getDealStageHistory,
  NotFoundError,
  ValidationError,
} from '../crm.service.js';
import type { CrmConfig } from '../config.js';
import '../types.js';

export function registerCrmRoutes(app: FastifyInstance, config: CrmConfig): void {
  // POST /pipelines — create pipeline
  app.post<{ Body: { name: string } }>('/pipelines', async (request, reply) => {
    const { tenant_id } = request.auth;
    const { name } = request.body;

    if (!name?.trim()) {
      await reply.status(400).send({ error: 'name is required' });
      return;
    }

    try {
      const pipeline = await createPipeline(tenant_id, name.trim());
      await reply.status(201).send(pipeline);
    } catch (err) {
      app.log.error(err, 'Failed to create pipeline');
      await reply.status(500).send({ error: 'Failed to create pipeline' });
    }
  });

  // POST /pipelines/:id/deals — create deal
  app.post<{
    Params: { id: string };
    Body: {
      contact_id: string;
      name: string;
      stage_id: string;
      value?: number;
      expected_close_date?: string;
      owner_id?: string;
    };
  }>('/pipelines/:id/deals', async (request, reply) => {
    const { tenant_id, user_id } = request.auth;
    const { id: pipelineId } = request.params;
    const body = request.body;

    if (!body.contact_id || !body.name?.trim() || !body.stage_id) {
      await reply.status(400).send({ error: 'contact_id, name, and stage_id are required' });
      return;
    }

    try {
      const deal = await createDeal(tenant_id, pipelineId, user_id, body);
      await reply.status(201).send(deal);
    } catch (err) {
      if (err instanceof NotFoundError) {
        await reply.status(404).send({ error: err.message });
      } else if (err instanceof ValidationError) {
        await reply.status(400).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to create deal');
        await reply.status(500).send({ error: 'Failed to create deal' });
      }
    }
  });

  // PUT /deals/:id — update deal
  app.put<{
    Params: { id: string };
    Body: {
      name?: string;
      stage_id?: string;
      value?: number;
      expected_close_date?: string | null;
      owner_id?: string;
      status?: 'open' | 'won' | 'lost' | 'overdue';
    };
  }>('/deals/:id', async (request, reply) => {
    const { tenant_id, user_id } = request.auth;
    const { id: dealId } = request.params;

    try {
      const deal = await updateDeal(tenant_id, dealId, user_id, request.body);
      await reply.status(200).send(deal);
    } catch (err) {
      if (err instanceof NotFoundError) {
        await reply.status(404).send({ error: err.message });
      } else if (err instanceof ValidationError) {
        await reply.status(400).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to update deal');
        await reply.status(500).send({ error: 'Failed to update deal' });
      }
    }
  });

  // GET /pipelines/:id/board — Kanban board
  app.get<{ Params: { id: string } }>('/pipelines/:id/board', async (request, reply) => {
    const { tenant_id } = request.auth;
    const { id: pipelineId } = request.params;

    try {
      const board = await getPipelineBoard(tenant_id, pipelineId);
      await reply.status(200).send(board);
    } catch (err) {
      if (err instanceof NotFoundError) {
        await reply.status(404).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to get pipeline board');
        await reply.status(500).send({ error: 'Failed to get pipeline board' });
      }
    }
  });

  // GET /pipelines/:id/forecast — weighted revenue forecast
  app.get<{ Params: { id: string } }>('/pipelines/:id/forecast', async (request, reply) => {
    const { tenant_id } = request.auth;
    const { id: pipelineId } = request.params;

    try {
      const forecast = await getPipelineForecast(tenant_id, pipelineId);
      await reply.status(200).send(forecast);
    } catch (err) {
      if (err instanceof NotFoundError) {
        await reply.status(404).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to get pipeline forecast');
        await reply.status(500).send({ error: 'Failed to get pipeline forecast' });
      }
    }
  });

  // POST /deals/:id/activities — log activity
  app.post<{
    Params: { id: string };
    Body: {
      type: 'call' | 'email' | 'meeting' | 'note';
      content: string;
      contact_id?: string;
    };
  }>('/deals/:id/activities', async (request, reply) => {
    const { tenant_id, user_id } = request.auth;
    const { id: dealId } = request.params;
    const body = request.body;

    const validTypes = ['call', 'email', 'meeting', 'note'];
    if (!body.type || !validTypes.includes(body.type)) {
      await reply.status(400).send({ error: `type must be one of: ${validTypes.join(', ')}` });
      return;
    }
    if (!body.content?.trim()) {
      await reply.status(400).send({ error: 'content is required' });
      return;
    }

    try {
      const activity = await logActivity(tenant_id, dealId, user_id, body);
      await reply.status(201).send(activity);
    } catch (err) {
      if (err instanceof NotFoundError) {
        await reply.status(404).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to log activity');
        await reply.status(500).send({ error: 'Failed to log activity' });
      }
    }
  });

  // GET /deals/:id/activities — list activities for a deal
  app.get<{ Params: { id: string } }>('/deals/:id/activities', async (request, reply) => {
    const { tenant_id } = request.auth;
    const { id: dealId } = request.params;

    try {
      const activities = await getDealActivities(tenant_id, dealId);
      await reply.status(200).send({ activities });
    } catch (err) {
      if (err instanceof NotFoundError) {
        await reply.status(404).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to get activities');
        await reply.status(500).send({ error: 'Failed to get activities' });
      }
    }
  });

  // GET /deals/:id/history — stage transition history
  app.get<{ Params: { id: string } }>('/deals/:id/history', async (request, reply) => {
    const { tenant_id } = request.auth;
    const { id: dealId } = request.params;

    try {
      const history = await getDealStageHistory(tenant_id, dealId);
      await reply.status(200).send({ history });
    } catch (err) {
      if (err instanceof NotFoundError) {
        await reply.status(404).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to get stage history');
        await reply.status(500).send({ error: 'Failed to get stage history' });
      }
    }
  });
}
