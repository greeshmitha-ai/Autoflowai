import type { FastifyInstance } from 'fastify';
import {
  createReport,
  listReports,
  getReport,
  updateReport,
  executeReport,
  createOrUpdateSchedule,
  ValidationError,
  NotFoundError,
} from '../report.service.js';
import type { ReportDefinition } from '@platform/db';
import '../types.js';

export function registerReportRoutes(app: FastifyInstance): void {
  // POST /reports — create report definition (Req 23.1, 23.3)
  app.post<{ Body: { name: string; definition: ReportDefinition } }>(
    '/reports',
    async (request, reply) => {
      const { tenant_id, user_id } = request.auth;
      try {
        const report = await createReport(tenant_id, user_id, request.body);
        await reply.status(201).send(report);
      } catch (err) {
        if (err instanceof ValidationError) {
          await reply.status(400).send({ error: err.message });
        } else {
          app.log.error(err, 'Failed to create report');
          await reply.status(500).send({ error: 'Failed to create report' });
        }
      }
    },
  );

  // GET /reports — list reports for tenant (Req 23.3)
  app.get('/reports', async (request, reply) => {
    const { tenant_id } = request.auth;
    try {
      const list = await listReports(tenant_id);
      await reply.status(200).send({ reports: list });
    } catch (err) {
      app.log.error(err, 'Failed to list reports');
      await reply.status(500).send({ error: 'Failed to list reports' });
    }
  });

  // GET /reports/:id — get report definition (Req 23.1)
  app.get<{ Params: { id: string } }>('/reports/:id', async (request, reply) => {
    const { tenant_id } = request.auth;
    try {
      const report = await getReport(tenant_id, request.params.id);
      await reply.status(200).send(report);
    } catch (err) {
      if (err instanceof NotFoundError) {
        await reply.status(404).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to get report');
        await reply.status(500).send({ error: 'Failed to get report' });
      }
    }
  });

  // PUT /reports/:id — update report definition (Req 23.1)
  app.put<{
    Params: { id: string };
    Body: { name?: string; definition?: ReportDefinition };
  }>('/reports/:id', async (request, reply) => {
    const { tenant_id } = request.auth;
    try {
      const report = await updateReport(tenant_id, request.params.id, request.body);
      await reply.status(200).send(report);
    } catch (err) {
      if (err instanceof NotFoundError) {
        await reply.status(404).send({ error: err.message });
      } else if (err instanceof ValidationError) {
        await reply.status(400).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to update report');
        await reply.status(500).send({ error: 'Failed to update report' });
      }
    }
  });

  // GET /reports/:id/data — execute report and return data (Req 23.1, 23.5, 23.7)
  app.get<{ Params: { id: string } }>('/reports/:id/data', async (request, reply) => {
    const { tenant_id } = request.auth;
    try {
      const data = await executeReport(tenant_id, request.params.id);
      await reply.status(200).send(data);
    } catch (err) {
      if (err instanceof NotFoundError) {
        await reply.status(404).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to execute report');
        await reply.status(500).send({ error: 'Failed to execute report' });
      }
    }
  });

  // POST /reports/:id/schedule — configure scheduled delivery (Req 23.6)
  app.post<{
    Params: { id: string };
    Body: { frequency: 'daily' | 'weekly' | 'monthly'; recipients: string[] };
  }>('/reports/:id/schedule', async (request, reply) => {
    const { tenant_id } = request.auth;
    try {
      const schedule = await createOrUpdateSchedule(tenant_id, request.params.id, request.body);
      await reply.status(201).send(schedule);
    } catch (err) {
      if (err instanceof NotFoundError) {
        await reply.status(404).send({ error: err.message });
      } else if (err instanceof ValidationError) {
        await reply.status(400).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to create schedule');
        await reply.status(500).send({ error: 'Failed to create schedule' });
      }
    }
  });
}
