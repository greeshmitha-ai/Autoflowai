import type { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import type { JwtPayload } from '../types.js';

/**
 * JWT validation middleware using RS256.
 * Validates the Bearer token and injects user_id, tenant_id, roles into request.auth.
 */
export async function jwtMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    await reply.status(401).send({
      error: 'Unauthorized',
      message: 'Missing or invalid Authorization header',
    });
    return;
  }

  const token = authHeader.slice(7);
  const publicKey = process.env['JWT_PUBLIC_KEY'];

  if (!publicKey) {
    request.log.error('JWT_PUBLIC_KEY environment variable is not set');
    await reply.status(500).send({ error: 'Internal Server Error' });
    return;
  }

  try {
    const decoded = jwt.verify(token, publicKey, {
      algorithms: ['RS256'],
    }) as JwtPayload;

    // Validate required claims
    if (!decoded.user_id || !decoded.tenant_id || !Array.isArray(decoded.roles)) {
      await reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid token claims',
      });
      return;
    }

    // Inject auth context into request
    request.auth = {
      user_id: decoded.user_id,
      tenant_id: decoded.tenant_id,
      roles: decoded.roles,
    };
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      await reply.status(401).send({
        error: 'Unauthorized',
        message: 'Token has expired',
      });
      return;
    }

    if (err instanceof jwt.JsonWebTokenError) {
      await reply.status(401).send({
        error: 'Unauthorized',
        message: 'Invalid token',
      });
      return;
    }

    request.log.error({ err }, 'JWT validation error');
    await reply.status(500).send({ error: 'Internal Server Error' });
  }
}
