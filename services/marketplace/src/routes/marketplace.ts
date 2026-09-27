/**
 * Marketplace HTTP routes.
 *
 * GET    /marketplace/extensions         — list available extensions (35.1)
 * GET    /marketplace/extensions/:id     — get extension detail (35.1)
 * POST   /marketplace/extensions/:id/install   — install for tenant (35.2)
 * DELETE /marketplace/extensions/:id/uninstall — uninstall for tenant (35.3)
 * POST   /marketplace/submit             — developer submission (35.5)
 *
 * Requirements: 28.1–28.5, 28.7
 */
import type { FastifyInstance } from 'fastify';
import {
  listAvailableExtensions,
  getExtensionById,
  installExtension,
  uninstallExtension,
  submitExtension,
  NotFoundError,
  ConflictError,
  ValidationError,
  type SubmitExtensionInput,
} from '../marketplace.service.js';
import '../types.js';

export function registerMarketplaceRoutes(app: FastifyInstance): void {
  // ── GET /marketplace/extensions ───────────────────────────────────────────
  app.get('/marketplace/extensions', async (_request, reply) => {
    try {
      const list = await listAvailableExtensions();
      await reply.status(200).send({ extensions: list });
    } catch (err) {
      app.log.error(err, 'Failed to list extensions');
      await reply.status(500).send({ error: 'Failed to list extensions' });
    }
  });

  // ── GET /marketplace/extensions/:id ───────────────────────────────────────
  app.get<{ Params: { id: string } }>(
    '/marketplace/extensions/:id',
    async (request, reply) => {
      try {
        const ext = await getExtensionById(request.params.id);
        await reply.status(200).send(ext);
      } catch (err) {
        if (err instanceof NotFoundError) {
          await reply.status(404).send({ error: err.message });
        } else {
          app.log.error(err, 'Failed to get extension');
          await reply.status(500).send({ error: 'Failed to get extension' });
        }
      }
    },
  );

  // ── POST /marketplace/extensions/:id/install ──────────────────────────────
  app.post<{ Params: { id: string } }>(
    '/marketplace/extensions/:id/install',
    async (request, reply) => {
      const { tenant_id } = request.auth;
      try {
        const result = await installExtension(tenant_id, request.params.id);

        // Stub: publish install event to message bus
        app.log.info(
          { tenant_id, extension_id: request.params.id },
          '[marketplace] Extension install event would be published to message bus',
        );

        await reply.status(201).send(result);
      } catch (err) {
        if (err instanceof NotFoundError) {
          await reply.status(404).send({ error: err.message });
        } else if (err instanceof ConflictError) {
          await reply.status(409).send({ error: err.message });
        } else {
          app.log.error(err, 'Failed to install extension');
          await reply.status(500).send({ error: 'Failed to install extension' });
        }
      }
    },
  );

  // ── DELETE /marketplace/extensions/:id/uninstall ──────────────────────────
  app.delete<{ Params: { id: string } }>(
    '/marketplace/extensions/:id/uninstall',
    async (request, reply) => {
      const { tenant_id } = request.auth;
      try {
        await uninstallExtension(tenant_id, request.params.id);
        await reply.status(204).send();
      } catch (err) {
        if (err instanceof NotFoundError) {
          await reply.status(404).send({ error: err.message });
        } else {
          app.log.error(err, 'Failed to uninstall extension');
          await reply.status(500).send({ error: 'Failed to uninstall extension' });
        }
      }
    },
  );

  // ── POST /marketplace/submit ───────────────────────────────────────────────
  app.post<{ Body: SubmitExtensionInput }>(
    '/marketplace/submit',
    async (request, reply) => {
      try {
        const ext = await submitExtension(request.body ?? {});
        await reply.status(201).send(ext);
      } catch (err) {
        if (err instanceof ValidationError) {
          await reply.status(400).send({ error: err.message });
        } else {
          app.log.error(err, 'Failed to submit extension');
          await reply.status(500).send({ error: 'Failed to submit extension' });
        }
      }
    },
  );
}
