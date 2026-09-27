import type { FastifyRequest, FastifyReply } from 'fastify';
import { verifyAccessToken } from '../token.js';
import type { AuthConfig } from '../config.js';

/**
 * JWT authentication middleware for the auth service's own protected routes.
 * Validates the Bearer token and injects auth context into request.auth.
 */
export function createJwtAuthMiddleware(config: AuthConfig) {
  return async function jwtAuthMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      await reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header',
      });
      return;
    }

    const token = authHeader.slice(7);

    try {
      const payload = verifyAccessToken(token, config.jwtPublicKey);

      if (!payload.user_id || !payload.tenant_id || !Array.isArray(payload.roles)) {
        await reply.status(401).send({ error: 'Unauthorized', message: 'Invalid token claims' });
        return;
      }

      request.auth = {
        user_id: payload.user_id,
        tenant_id: payload.tenant_id,
        roles: payload.roles,
      };
    } catch {
      await reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }
  };
}
