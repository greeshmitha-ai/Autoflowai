import type { FastifyInstance } from 'fastify';
import {
  getUserPreferences,
  upsertUserPreference,
  getRoleDefaults,
  upsertRoleDefault,
  ValidationError,
  type UpsertPreferenceInput,
  type UpsertRoleDefaultInput,
  type NotificationChannel,
} from '../notification.service.js';
import '../types.js';

export function registerNotificationRoutes(app: FastifyInstance): void {
  // ─── User Preferences ────────────────────────────────────────────────────────

  // GET /notifications/preferences — get current user's preferences (Req 22.2)
  app.get('/notifications/preferences', async (request, reply) => {
    const { tenant_id, user_id } = request.auth;

    try {
      const prefs = await getUserPreferences(tenant_id, user_id);
      await reply.status(200).send({ preferences: prefs });
    } catch (err) {
      app.log.error(err, 'Failed to get notification preferences');
      await reply.status(500).send({ error: 'Failed to get preferences' });
    }
  });

  // PUT /notifications/preferences — upsert a preference entry (Req 22.2, 22.3)
  app.put<{
    Body: {
      event_type: string;
      channels: NotificationChannel[];
      dnd_start_hour?: number;
      dnd_end_hour?: number;
    };
  }>('/notifications/preferences', async (request, reply) => {
    const { tenant_id, user_id } = request.auth;

    const input: UpsertPreferenceInput = {
      event_type: request.body.event_type,
      channels: request.body.channels,
      dnd_start_hour: request.body.dnd_start_hour ?? null,
      dnd_end_hour: request.body.dnd_end_hour ?? null,
    };

    try {
      const pref = await upsertUserPreference(tenant_id, user_id, input);
      await reply.status(200).send(pref);
    } catch (err) {
      if (err instanceof ValidationError) {
        await reply.status(400).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to update notification preferences');
        await reply.status(500).send({ error: 'Failed to update preferences' });
      }
    }
  });

  // ─── Role-level Defaults ─────────────────────────────────────────────────────

  // GET /notifications/preferences/defaults — get role-level defaults (Req 22.4)
  app.get<{ Querystring: { role?: string } }>(
    '/notifications/preferences/defaults',
    async (request, reply) => {
      const { tenant_id } = request.auth;
      const { role } = request.query;

      try {
        const defaults = await getRoleDefaults(tenant_id, role);
        await reply.status(200).send({ defaults });
      } catch (err) {
        app.log.error(err, 'Failed to get role defaults');
        await reply.status(500).send({ error: 'Failed to get role defaults' });
      }
    },
  );

  // POST /notifications/preferences/defaults — set role-level defaults (admin only) (Req 22.4)
  app.post<{
    Body: {
      role: string;
      event_type: string;
      channels: NotificationChannel[];
      dnd_start_hour?: number;
      dnd_end_hour?: number;
    };
  }>('/notifications/preferences/defaults', async (request, reply) => {
    const { tenant_id, roles } = request.auth;

    // Admin-only endpoint
    if (!roles.includes('admin') && !roles.includes('owner')) {
      await reply.status(403).send({ error: 'Forbidden: admin or owner role required' });
      return;
    }

    const input: UpsertRoleDefaultInput = {
      role: request.body.role,
      event_type: request.body.event_type,
      channels: request.body.channels,
      dnd_start_hour: request.body.dnd_start_hour ?? null,
      dnd_end_hour: request.body.dnd_end_hour ?? null,
    };

    try {
      const def = await upsertRoleDefault(tenant_id, input);
      await reply.status(201).send(def);
    } catch (err) {
      if (err instanceof ValidationError) {
        await reply.status(400).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to set role default');
        await reply.status(500).send({ error: 'Failed to set role default' });
      }
    }
  });
}
