import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { getDb, importJobs } from '@platform/db';
import { ContactService, ValidationError } from '../contact.service.js';
import type { ContactListQuery, CreateContactBody, UpdateContactBody } from '../types.js';
import { uploadToS3 } from '../s3.js';
import { processImportJob } from '../import.worker.js';
import type { ContactConfig } from '../config.js';
import type { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { randomUUID } from 'crypto';

export function registerContactRoutes(
  app: FastifyInstance,
  config: ContactConfig,
  esClient: ElasticsearchClient,
): void {
  const service = new ContactService(esClient, config.kafkaBrokers);

  // GET /contacts
  app.get(
    '/contacts',
    async (
      request: FastifyRequest<{ Querystring: ContactListQuery }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const query: ContactListQuery = {
        ...(request.query.q !== undefined ? { q: request.query.q } : {}),
        page: request.query.page ? Number(request.query.page) : 1,
        limit: request.query.limit ? Number(request.query.limit) : 20,
        ...(request.query.tags !== undefined ? { tags: request.query.tags } : {}),
        ...(request.query.lifecycle_stage !== undefined ? { lifecycle_stage: request.query.lifecycle_stage } : {}),
        ...(request.query.lead_score_min !== undefined ? { lead_score_min: Number(request.query.lead_score_min) } : {}),
        ...(request.query.lead_score_max !== undefined ? { lead_score_max: Number(request.query.lead_score_max) } : {}),
      };

      const result = await service.listContacts(tenantId, query);
      return reply.send(result);
    },
  );

  // POST /contacts
  app.post(
    '/contacts',
    async (
      request: FastifyRequest<{ Body: CreateContactBody }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      const userId = request.auth?.user_id ?? '';
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        const contact = await service.createContact(tenantId, userId, request.body);
        return reply.status(201).send(contact);
      } catch (err) {
        if (err instanceof ValidationError) {
          return reply.status(400).send({ error: 'Bad Request', message: err.message });
        }
        throw err;
      }
    },
  );

  // PUT /contacts/:id
  app.put(
    '/contacts/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: UpdateContactBody }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        const contact = await service.updateContact(tenantId, request.params.id, request.body);
        if (!contact) return reply.status(404).send({ error: 'Not Found' });
        return reply.send(contact);
      } catch (err) {
        if (err instanceof ValidationError) {
          return reply.status(400).send({ error: 'Bad Request', message: err.message });
        }
        throw err;
      }
    },
  );

  // DELETE /contacts/:id — soft-delete (sets pii_erasure_requested_at)
  app.delete(
    '/contacts/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const deleted = await service.deleteContact(tenantId, request.params.id);
      if (!deleted) return reply.status(404).send({ error: 'Not Found' });
      return reply.status(204).send();
    },
  );

  // POST /contacts/import — upload CSV to S3, create import job
  app.post(
    '/contacts/import',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      const userId = request.auth?.user_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      // Expect raw CSV body (Content-Type: text/csv or application/octet-stream)
      const body = request.body as Buffer | string;
      if (!body) {
        return reply.status(400).send({ error: 'Bad Request', message: 'CSV body required' });
      }

      const s3Key = `imports/${tenantId}/${randomUUID()}.csv`;
      await uploadToS3(config.s3Bucket, s3Key, body);

      const db = getDb();
      const [job] = await db
        .insert(importJobs)
        .values({
          tenant_id: tenantId,
          ...(userId !== undefined ? { created_by: userId } : {}),
          s3_key: s3Key,
          status: 'pending' as const,
        })
        .returning();

      if (!job) throw new Error('Failed to create import job');

      // Enqueue background worker (fire-and-forget in this implementation)
      void processImportJob(job.job_id, tenantId, {
        s3Bucket: config.s3Bucket,
        kafkaBrokers: config.kafkaBrokers,
      }).catch((err) => {
        console.error(`Import job ${job.job_id} failed:`, err);
      });

      return reply.status(202).send({
        job_id: job.job_id,
        status: job.status,
        created_at: job.created_at,
      });
    },
  );

  // GET /contacts/import/:jobId — poll job status
  app.get(
    '/contacts/import/:jobId',
    async (
      request: FastifyRequest<{ Params: { jobId: string } }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const db = getDb();
      const [job] = await db
        .select()
        .from(importJobs)
        .where(
          and(
            eq(importJobs.job_id, request.params.jobId),
            eq(importJobs.tenant_id, tenantId),
          ),
        )
        .limit(1);

      if (!job) return reply.status(404).send({ error: 'Not Found' });

      return reply.send({
        job_id: job.job_id,
        status: job.status,
        total_rows: job.total_rows,
        success_count: job.success_count,
        error_count: job.error_count,
        error_details: job.error_details,
        created_at: job.created_at,
        updated_at: job.updated_at,
        completed_at: job.completed_at,
      });
    },
  );

  // POST /contacts/deduplicate
  app.post(
    '/contacts/deduplicate',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const result = await service.deduplicateContacts(tenantId);
      return reply.send(result);
    },
  );
}
