import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AuthConfig } from '../config.js';
import { issueTokens } from '../token.js';
import { RefreshTokenStore } from '../refresh-store.js';

interface RefreshBody {
  refresh_token: string;
}

export function refreshRoutes(
  app: FastifyInstance,
  config: AuthConfig,
  refreshStore: RefreshTokenStore,
): void {
  app.post<{ Body: RefreshBody }>(
    '/auth/refresh',
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
    async (request: FastifyRequest<{ Body: RefreshBody }>, reply: FastifyReply) => {
      const { refresh_token } = request.body;

      const tokenData = await refreshStore.get(refresh_token);
      if (!tokenData) {
        return reply.status(401).send({ error: 'Invalid or expired refresh token' });
      }

      // Rotate: delete old token, issue new pair
      await refreshStore.delete(refresh_token);

      const tokens = issueTokens(
        {
          user_id: tokenData.user_id,
          tenant_id: tokenData.tenant_id,
          roles: tokenData.roles,
        },
        config,
      );

      await refreshStore.save(tokens.refreshToken, {
        user_id: tokenData.user_id,
        tenant_id: tokenData.tenant_id,
        roles: tokenData.roles,
      });

      return reply.status(200).send({
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_type: 'Bearer',
        expires_in: tokens.expiresIn,
      });
    },
  );
}
