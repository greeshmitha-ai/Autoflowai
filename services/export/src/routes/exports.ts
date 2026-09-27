/**
 * Export Service HTTP routes.
 *
 * POST /exports        — create export job
 * GET  /exports/:jobId — poll export job status and get download URL
 *
 * Requirements: 32.1, 32.2
 */
import type { FastifyInstance } from 'fastify';
import {
  createExportJob,
  getExportJob,
  processExportJob,
  ValidationError,
  NotFoundError,
} from '../export.service.js';
import '../types.js';

export function registerExportRoutes(app: FastifyInstance): void {
  // POST /exports — create export job (Req 32.1, 32.2)
  app.post<{
    Body: {
      type: 'pdf' | 'png';
      source_url: string;
      report_name: string;
      tenant_name: string;
      date_range?: string;
    };
  }>('/exports', async (request, reply) => {
    const { tenant_id, user_id } = request.auth;

    try {
      const job = await createExportJob(tenant_id, user_id, request.body);

      // Process asynchronously — do not await (fire-and-forget with notification)
      setImmediate(() => {
        processExportJob(
          tenant_id,
          job.job_id,
          async (completedJob, downloadUrl) => {
            // In production, publish to Notification Service via message bus
            app.log.info(
              { jobId: completedJob.job_id, downloadUrl },
              '[ExportService] Export completed — notify user',
            );
          },
          async (failedJob, error) => {
            app.log.warn(
              { jobId: failedJob.job_id, error },
              '[ExportService] Export failed — notify user',
            );
          },
        ).catch((err) => {
          app.log.error(err, 'Unhandled error in export job processor');
        });
      });

      await reply.status(202).send({
        job_id: job.job_id,
        status: job.status,
        created_at: job.created_at,
      });
    } catch (err) {
      if (err instanceof ValidationError) {
        await reply.status(400).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to create export job');
        await reply.status(500).send({ error: 'Failed to create export job' });
      }
    }
  });

  // GET /exports/:jobId — poll export job status (Req 32.2)
  app.get<{ Params: { jobId: string } }>(
    '/exports/:jobId',
    async (request, reply) => {
      const { tenant_id } = request.auth;
      const { jobId } = request.params;

      try {
        const job = await getExportJob(tenant_id, jobId);

        const response: Record<string, unknown> = {
          job_id: job.job_id,
          type: job.type,
          status: job.status,
          report_name: job.report_name,
          created_at: job.created_at,
          completed_at: job.completed_at,
        };

        if (job.status === 'completed' && job.download_url) {
          response['download_url'] = job.download_url;
        }

        if (job.status === 'failed') {
          response['error'] = job.error;
          if (job.partial_output_expires_at) {
            response['partial_output_expires_at'] = job.partial_output_expires_at;
          }
        }

        await reply.status(200).send(response);
      } catch (err) {
        if (err instanceof NotFoundError) {
          await reply.status(404).send({ error: err.message });
        } else {
          app.log.error(err, 'Failed to get export job');
          await reply.status(500).send({ error: 'Failed to get export job' });
        }
      }
    },
  );
}
