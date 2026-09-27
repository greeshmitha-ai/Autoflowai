import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { RefreshTokenStore } from '../refresh-store.js';

interface LogoutBody {
  refresh_token: string;
}

export function logoutRoutes(app: FastifyInstance, refreshStore: RefreshTokenStore): void {
  app.post<{ Body: LogoutBody }>(
    '/auth/logout',
    {
      schema: {
        body: {
          type: 'object',
          required: ['refresh_token'],
          properties: {
            refresh_token: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: LogoutBody }>, reply: FastifyReply) => {
      const { refresh_token } = request.body;

      // Invalidate the refresh token — idempotent (no error if already gone)
      await refreshStore.delete(refresh_token);

      return reply.status(200).send({ message: 'Logged out successfully' });
    },
  );
}
