import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MultipartFile } from '@fastify/multipart';
import {
  createAgent,
  updateAgent,
  getConversation,
  createKnowledgeBaseEntry,
  NotFoundError,
  ValidationError,
} from '../agent.service.js';
import { uploadKnowledgeDocument } from '../s3.js';
import type { ChatbotConfig } from '../config.js';

// Enqueue vector embedding pipeline (async worker stub)
async function enqueueEmbeddingJob(kbId: string, s3Key: string, agentId: string): Promise<void> {
  // TODO: publish to message bus / job queue for vector embedding pipeline
  // The worker should index the document and call markKnowledgeBaseIndexed(kbId)
  // within 5 minutes per requirements.
  console.log(`[embedding-worker] Enqueued job: kbId=${kbId} s3Key=${s3Key} agentId=${agentId}`);
}

export function registerAgentRoutes(app: FastifyInstance, config: ChatbotConfig): void {
  // POST /agents — create agent
  app.post(
    '/agents',
    async (
      request: FastifyRequest<{
        Body: {
          name: string;
          persona?: string;
          escalation_threshold?: number;
          deployment_targets?: string[];
        };
      }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        const agent = await createAgent(tenantId, request.body);
        return reply.status(201).send(agent);
      } catch (err) {
        if (err instanceof ValidationError)
          return reply.status(400).send({ error: 'Bad Request', message: err.message });
        throw err;
      }
    },
  );

  // PUT /agents/:id — update agent
  app.put(
    '/agents/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          name?: string;
          persona?: string;
          escalation_threshold?: number;
          deployment_targets?: string[];
        };
      }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        const agent = await updateAgent(tenantId, request.params.id, request.body);
        return reply.send(agent);
      } catch (err) {
        if (err instanceof NotFoundError) return reply.status(404).send({ error: 'Not Found' });
        throw err;
      }
    },
  );

  // GET /conversations/:id — retrieve conversation transcript
  app.get(
    '/conversations/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        const conv = await getConversation(tenantId, request.params.id);
        return reply.send(conv);
      } catch (err) {
        if (err instanceof NotFoundError) return reply.status(404).send({ error: 'Not Found' });
        throw err;
      }
    },
  );

  // POST /agents/:id/knowledge — upload knowledge base document
  app.post(
    '/agents/:id/knowledge',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const agentId = request.params.id;

      let file: MultipartFile | undefined;
      try {
        file = await request.file();
      } catch {
        return reply.status(400).send({ error: 'Bad Request', message: 'Multipart file required' });
      }

      if (!file) {
        return reply.status(400).send({ error: 'Bad Request', message: 'No file uploaded' });
      }

      const chunks: Buffer[] = [];
      for await (const chunk of file.file) {
        chunks.push(chunk as Buffer);
      }
      const body = Buffer.concat(chunks);

      const s3Key = await uploadKnowledgeDocument(
        config.s3Bucket,
        config.s3Region,
        agentId,
        file.filename,
        body,
        file.mimetype,
      );

      const entry = await createKnowledgeBaseEntry(tenantId, agentId, file.filename, s3Key);

      // Enqueue async vector embedding pipeline
      void enqueueEmbeddingJob(entry.kb_id, s3Key, agentId);

      return reply.status(202).send({
        kb_id: entry.kb_id,
        filename: entry.filename,
        s3_key: entry.s3_key,
        status: entry.status,
        message: 'Document uploaded. Indexing in progress (available within 5 minutes).',
      });
    },
  );
}
