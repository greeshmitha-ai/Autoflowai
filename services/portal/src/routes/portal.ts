import type { FastifyInstance } from 'fastify';
import { signPortalJwt } from '../middleware/portal-jwt-auth.js';
import {
  sendMagicLink,
  verifyMagicLink,
  portalPasswordLogin,
  getContactHistory,
  createSupportTicket,
  listSupportTickets,
  getPreferences,
  updatePreferences,
  requestDataExport,
  ValidationError,
  NotFoundError,
  AuthError,
} from '../portal.service.js';

const PORTAL_JWT_TTL = 60 * 60 * 8; // 8 hours

export function registerPortalRoutes(app: FastifyInstance, jwtSecret: string): void {
  // ─── Auth routes (no auth required) ────────────────────────────────────────

  /** POST /portal/auth/magic-link — send magic link email */
  app.post<{ Body: { email: string; tenant_id: string } }>(
    '/portal/auth/magic-link',
    async (request, reply) => {
      const { email, tenant_id } = request.body ?? {};
      try {
        const result = await sendMagicLink(tenant_id, email);
        await reply.status(200).send({
          message: 'Magic link sent. Check your email.',
          // Expose token in dev/test; remove in production
          ...(process.env['NODE_ENV'] !== 'production' && { debug_token: result.token }),
        });
      } catch (err) {
        if (err instanceof ValidationError) {
          return reply.status(400).send({ error: err.message });
        }
        if (err instanceof NotFoundError) {
          // Return 200 to avoid email enumeration
          return reply.status(200).send({ message: 'If an account exists, a magic link was sent.' });
        }
        throw err;
      }
    },
  );

  /** GET /portal/auth/verify?token= — verify magic link, return session JWT */
  app.get<{ Querystring: { token: string } }>(
    '/portal/auth/verify',
    async (request, reply) => {
      const { token } = request.query;
      try {
        const session = await verifyMagicLink(token);
        const jwt = signPortalJwt(
          {
            contact_id: session.contact_id,
            tenant_id: session.tenant_id,
            email: session.email,
            session_id: session.session_id,
            exp: Math.floor(Date.now() / 1000) + PORTAL_JWT_TTL,
          },
          jwtSecret,
        );
        await reply.status(200).send({ token: jwt });
      } catch (err) {
        if (err instanceof ValidationError) {
          return reply.status(400).send({ error: err.message });
        }
        if (err instanceof AuthError) {
          return reply.status(401).send({ error: err.message });
        }
        throw err;
      }
    },
  );

  /** POST /portal/auth/login — password-based login */
  app.post<{ Body: { email: string; password: string; tenant_id: string } }>(
    '/portal/auth/login',
    async (request, reply) => {
      const { email, password, tenant_id } = request.body ?? {};
      try {
        const session = await portalPasswordLogin(tenant_id, email, password);
        const jwt = signPortalJwt(
          {
            contact_id: session.contact_id,
            tenant_id: session.tenant_id,
            email: session.email,
            session_id: session.session_id,
            exp: Math.floor(Date.now() / 1000) + PORTAL_JWT_TTL,
          },
          jwtSecret,
        );
        await reply.status(200).send({ token: jwt });
      } catch (err) {
        if (err instanceof ValidationError) {
          return reply.status(400).send({ error: err.message });
        }
        if (err instanceof AuthError) {
          return reply.status(401).send({ error: 'Invalid credentials' });
        }
        throw err;
      }
    },
  );

  // ─── Authenticated portal routes ────────────────────────────────────────────

  /** GET /portal/history — interaction history */
  app.get('/portal/history', async (request, reply) => {
    const auth = request.portalAuth;
    if (!auth) return reply.status(401).send({ error: 'Unauthorized' });

    const history = await getContactHistory(auth.tenant_id, auth.contact_id);
    await reply.status(200).send({ history });
  });

  /** POST /portal/tickets — submit support ticket */
  app.post<{
    Body: { subject: string; description: string; file_attachment_url?: string };
  }>('/portal/tickets', async (request, reply) => {
    const auth = request.portalAuth;
    if (!auth) return reply.status(401).send({ error: 'Unauthorized' });

    try {
      const ticket = await createSupportTicket(auth.tenant_id, auth.contact_id, request.body);
      await reply.status(201).send({ ticket });
    } catch (err) {
      if (err instanceof ValidationError) {
        return reply.status(400).send({ error: err.message });
      }
      throw err;
    }
  });

  /** GET /portal/tickets — list customer's tickets */
  app.get('/portal/tickets', async (request, reply) => {
    const auth = request.portalAuth;
    if (!auth) return reply.status(401).send({ error: 'Unauthorized' });

    const tickets = await listSupportTickets(auth.tenant_id, auth.contact_id);
    await reply.status(200).send({ tickets });
  });

  /** GET /portal/preferences — get communication preferences */
  app.get('/portal/preferences', async (request, reply) => {
    const auth = request.portalAuth;
    if (!auth) return reply.status(401).send({ error: 'Unauthorized' });

    try {
      const prefs = await getPreferences(auth.tenant_id, auth.contact_id);
      await reply.status(200).send({ preferences: prefs });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.status(404).send({ error: err.message });
      }
      throw err;
    }
  });

  /** PUT /portal/preferences — update communication preferences */
  app.put<{
    Body: { email_opt_in: boolean; sms_opt_in: boolean; in_app_opt_in: boolean };
  }>('/portal/preferences', async (request, reply) => {
    const auth = request.portalAuth;
    if (!auth) return reply.status(401).send({ error: 'Unauthorized' });

    try {
      const prefs = await updatePreferences(auth.tenant_id, auth.contact_id, request.body);
      await reply.status(200).send({ preferences: prefs });
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.status(404).send({ error: err.message });
      }
      throw err;
    }
  });

  /** POST /portal/data-export — request personal data export */
  app.post('/portal/data-export', async (request, reply) => {
    const auth = request.portalAuth;
    if (!auth) return reply.status(401).send({ error: 'Unauthorized' });

    try {
      const result = await requestDataExport(auth.tenant_id, auth.contact_id);
      await reply.status(202).send(result);
    } catch (err) {
      if (err instanceof NotFoundError) {
        return reply.status(404).send({ error: err.message });
      }
      throw err;
    }
  });
}
