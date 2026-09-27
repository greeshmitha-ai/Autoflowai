import type { FastifyRequest, FastifyReply } from 'fastify';
import { hasPermission, type Permission } from '../types.js';

/**
 * RBAC middleware factory.
 * Returns a Fastify preHandler that checks the authenticated user's roles
 * against the required permission.
 *
 * Usage:
 *   app.get('/contacts', { preHandler: requirePermission('contacts:read') }, handler)
 */
export function requirePermission(permission: Permission) {
  return async function rbacMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!request.auth) {
      await reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
      return;
    }

    if (!hasPermission(request.auth.roles, permission)) {
      await reply.status(403).send({
        error: 'Forbidden',
        message: `Insufficient permissions. Required: ${permission}`,
      });
      return;
    }
  };
}

/**
 * Middleware that requires any of the given permissions (OR logic).
 */
export function requireAnyPermission(...permissions: Permission[]) {
  return async function rbacMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!request.auth) {
      await reply.status(401).send({ error: 'Unauthorized', message: 'Authentication required' });
      return;
    }

    const granted = permissions.some((p) => hasPermission(request.auth!.roles, p));
    if (!granted) {
      await reply.status(403).send({
        error: 'Forbidden',
        message: `Insufficient permissions. Required one of: ${permissions.join(', ')}`,
      });
      return;
    }
  };
}
