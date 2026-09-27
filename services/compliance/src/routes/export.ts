import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createExportJob, getExportJob, NotFoundError } from '../export.service.js';

export function registerExportRoutes(app: FastifyInstance): void {
  // POST /tenants/:id/export — start async export job
  app.post(
    '/tenants/:id/export',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      // Tenant can only export their own data
      if (tenantId !== request.params.id) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const userId = request.auth?.user_id ?? '';
      const job = await createExportJob(tenantId, userId);
      return reply.status(202).send({
        job_id: job.job_id,
        status: job.status,
        message: 'Export job started. You will be notified with a download URL within 48 hours.',
      });
    },
  );

  // GET /tenants/:id/export/:jobId — poll export job status
  app.get(
    '/tenants/:id/export/:jobId',
    async (
      request: FastifyRequest<{ Params: { id: string; jobId: string } }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      if (tenantId !== request.params.id) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      try {
        const job = await getExportJob(tenantId, request.params.jobId);
        return reply.send({
          job_id: job.job_id,
          status: job.status,
          download_url: job.download_url ?? null,
          created_at: job.created_at,
          completed_at: job.completed_at ?? null,
          error: job.error ?? null,
        });
      } catch (err) {
        if (err instanceof NotFoundError) {
          return reply.status(404).send({ error: 'Not Found' });
        }
        throw err;
      }
    },
  );
}
