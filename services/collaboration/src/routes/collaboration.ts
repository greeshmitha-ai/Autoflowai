import type { FastifyInstance } from 'fastify';
import {
  createNote,
  assignResource,
  getActivityFeed,
  autocompleteUsers,
  NotFoundError,
  ValidationError,
  type ResourceType,
} from '../collaboration.service.js';
import type { CollaborationConfig } from '../config.js';
import '../types.js';

export function registerCollaborationRoutes(
  app: FastifyInstance,
  config: CollaborationConfig,
): void {
  // ─── Internal Notes ─────────────────────────────────────────────────────────

  // POST /contacts/:id/notes — add internal note to contact (Req 21.1)
  app.post<{
    Params: { id: string };
    Body: { content: string };
  }>('/contacts/:id/notes', async (request, reply) => {
    const { tenant_id, user_id } = request.auth;
    const { id: resourceId } = request.params;

    try {
      const note = await createNote(
        tenant_id,
        user_id,
        'contact',
        resourceId,
        request.body,
        config.kafkaBrokers,
      );
      await reply.status(201).send(note);
    } catch (err) {
      if (err instanceof ValidationError) {
        await reply.status(400).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to create contact note');
        await reply.status(500).send({ error: 'Failed to create note' });
      }
    }
  });

  // POST /deals/:id/notes — add internal note to deal (Req 21.1)
  app.post<{
    Params: { id: string };
    Body: { content: string };
  }>('/deals/:id/notes', async (request, reply) => {
    const { tenant_id, user_id } = request.auth;
    const { id: resourceId } = request.params;

    try {
      const note = await createNote(
        tenant_id,
        user_id,
        'deal',
        resourceId,
        request.body,
        config.kafkaBrokers,
      );
      await reply.status(201).send(note);
    } catch (err) {
      if (err instanceof ValidationError) {
        await reply.status(400).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to create deal note');
        await reply.status(500).send({ error: 'Failed to create note' });
      }
    }
  });

  // POST /conversations/:id/notes — add internal note to inbox conversation (Req 21.1)
  app.post<{
    Params: { id: string };
    Body: { content: string };
  }>('/conversations/:id/notes', async (request, reply) => {
    const { tenant_id, user_id } = request.auth;
    const { id: resourceId } = request.params;

    try {
      const note = await createNote(
        tenant_id,
        user_id,
        'conversation',
        resourceId,
        request.body,
        config.kafkaBrokers,
      );
      await reply.status(201).send(note);
    } catch (err) {
      if (err instanceof ValidationError) {
        await reply.status(400).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to create conversation note');
        await reply.status(500).send({ error: 'Failed to create note' });
      }
    }
  });

  // ─── Assignments ─────────────────────────────────────────────────────────────

  // PUT /contacts/:id/assign — assign contact to user (Req 21.3)
  app.put<{
    Params: { id: string };
    Body: { assigned_to: string };
  }>('/contacts/:id/assign', async (request, reply) => {
    const { tenant_id, user_id } = request.auth;
    const { id: resourceId } = request.params;

    try {
      const assignment = await assignResource(
        tenant_id,
        user_id,
        'contact',
        resourceId,
        request.body,
        config.kafkaBrokers,
      );
      await reply.status(200).send(assignment);
    } catch (err) {
      if (err instanceof ValidationError) {
        await reply.status(400).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to assign contact');
        await reply.status(500).send({ error: 'Failed to assign contact' });
      }
    }
  });

  // PUT /deals/:id/assign — assign deal to user (Req 21.3)
  app.put<{
    Params: { id: string };
    Body: { assigned_to: string };
  }>('/deals/:id/assign', async (request, reply) => {
    const { tenant_id, user_id } = request.auth;
    const { id: resourceId } = request.params;

    try {
      const assignment = await assignResource(
        tenant_id,
        user_id,
        'deal',
        resourceId,
        request.body,
        config.kafkaBrokers,
      );
      await reply.status(200).send(assignment);
    } catch (err) {
      if (err instanceof ValidationError) {
        await reply.status(400).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to assign deal');
        await reply.status(500).send({ error: 'Failed to assign deal' });
      }
    }
  });

  // PUT /conversations/:id/assign — assign conversation to user (Req 21.3)
  app.put<{
    Params: { id: string };
    Body: { assigned_to: string };
  }>('/conversations/:id/assign', async (request, reply) => {
    const { tenant_id, user_id } = request.auth;
    const { id: resourceId } = request.params;

    try {
      const assignment = await assignResource(
        tenant_id,
        user_id,
        'conversation',
        resourceId,
        request.body,
        config.kafkaBrokers,
      );
      await reply.status(200).send(assignment);
    } catch (err) {
      if (err instanceof ValidationError) {
        await reply.status(400).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to assign conversation');
        await reply.status(500).send({ error: 'Failed to assign conversation' });
      }
    }
  });

  // ─── Activity Feed ────────────────────────────────────────────────────────────

  // GET /contacts/:id/activity-feed — chronological activity feed (Req 21.5)
  app.get<{ Params: { id: string } }>('/contacts/:id/activity-feed', async (request, reply) => {
    const { tenant_id } = request.auth;
    const { id: resourceId } = request.params;

    try {
      const feed = await getActivityFeed(tenant_id, 'contact', resourceId);
      await reply.status(200).send({ feed });
    } catch (err) {
      app.log.error(err, 'Failed to get contact activity feed');
      await reply.status(500).send({ error: 'Failed to get activity feed' });
    }
  });

  // GET /deals/:id/activity-feed — chronological activity feed (Req 21.5)
  app.get<{ Params: { id: string } }>('/deals/:id/activity-feed', async (request, reply) => {
    const { tenant_id } = request.auth;
    const { id: resourceId } = request.params;

    try {
      const feed = await getActivityFeed(tenant_id, 'deal', resourceId);
      await reply.status(200).send({ feed });
    } catch (err) {
      app.log.error(err, 'Failed to get deal activity feed');
      await reply.status(500).send({ error: 'Failed to get activity feed' });
    }
  });

  // ─── User Autocomplete ────────────────────────────────────────────────────────

  // GET /users/autocomplete?q= — return active users for @mention suggestions (Req 21.6)
  app.get<{ Querystring: { q?: string } }>('/users/autocomplete', async (request, reply) => {
    const { tenant_id } = request.auth;
    const q = request.query.q ?? '';

    try {
      const suggestions = await autocompleteUsers(tenant_id, q);
      await reply.status(200).send({ users: suggestions });
    } catch (err) {
      app.log.error(err, 'Failed to autocomplete users');
      await reply.status(500).send({ error: 'Failed to autocomplete users' });
    }
  });
}
