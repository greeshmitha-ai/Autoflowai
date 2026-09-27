import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  WorkflowService,
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../workflow.service.js';
import type { WorkflowDefinition } from '@platform/db';

interface CreateWorkflowBody {
  name: string;
  definition?: WorkflowDefinition;
}

interface UpdateWorkflowBody {
  name?: string;
  definition?: WorkflowDefinition;
}

export function registerWorkflowRoutes(app: FastifyInstance): void {
  const service = new WorkflowService();

  // POST /workflows
  app.post(
    '/workflows',
    async (request: FastifyRequest<{ Body: CreateWorkflowBody }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        const workflow = await service.createWorkflow(tenantId, request.body);
        return reply.status(201).send(workflow);
      } catch (err) {
        if (err instanceof ValidationError)
          return reply.status(400).send({ error: 'Bad Request', message: err.message });
        throw err;
      }
    },
  );

  // GET /workflows
  app.get('/workflows', async (request: FastifyRequest, reply: FastifyReply) => {
    const tenantId = request.auth?.tenant_id;
    if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

    const list = await service.listWorkflows(tenantId);
    return reply.send(list);
  });

  // GET /workflows/:id
  app.get(
    '/workflows/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const workflow = await service.getWorkflow(tenantId, request.params.id);
      if (!workflow) return reply.status(404).send({ error: 'Not Found' });
      return reply.send(workflow);
    },
  );

  // PUT /workflows/:id — blocked if active (409)
  app.put(
    '/workflows/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: UpdateWorkflowBody }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        const workflow = await service.updateWorkflow(tenantId, request.params.id, request.body);
        return reply.send(workflow);
      } catch (err) {
        if (err instanceof NotFoundError) return reply.status(404).send({ error: 'Not Found' });
        if (err instanceof ConflictError)
          return reply.status(409).send({ error: 'Conflict', message: err.message });
        if (err instanceof ValidationError)
          return reply.status(400).send({ error: 'Bad Request', message: err.message });
        throw err;
      }
    },
  );

  // POST /workflows/:id/activate
  app.post(
    '/workflows/:id/activate',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        const workflow = await service.activateWorkflow(tenantId, request.params.id);
        return reply.send(workflow);
      } catch (err) {
        if (err instanceof NotFoundError) return reply.status(404).send({ error: 'Not Found' });
        throw err;
      }
    },
  );

  // POST /workflows/:id/deactivate
  app.post(
    '/workflows/:id/deactivate',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        const workflow = await service.deactivateWorkflow(tenantId, request.params.id);
        return reply.send(workflow);
      } catch (err) {
        if (err instanceof NotFoundError) return reply.status(404).send({ error: 'Not Found' });
        throw err;
      }
    },
  );

  // GET /workflows/:id/executions — last 1,000
  app.get(
    '/workflows/:id/executions',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const executions = await service.getExecutions(tenantId, request.params.id, 1000);
      return reply.send(executions);
    },
  );
}
