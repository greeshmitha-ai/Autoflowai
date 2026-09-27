import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { getDb } from '@platform/db';
import { users } from '@platform/db';
import { verifyAccessToken } from '../token.js';
import type { AuthConfig } from '../config.js';

export function meRoutes(app: FastifyInstance, config: AuthConfig): void {
  app.get(
    '/auth/me',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Bearer ')) {
        return reply.status(401).send({ error: 'Missing Authorization header' });
      }

      const token = authHeader.slice(7);
      let payload;
      try {
        payload = verifyAccessToken(token, config.jwtPublicKey);
      } catch {
        return reply.status(401).send({ error: 'Invalid or expired token' });
      }

      const db = getDb();
      const [user] = await db
        .select({
          user_id: users.user_id,
          tenant_id: users.tenant_id,
          email: users.email,
          roles: users.roles,
          status: users.status,
          created_at: users.created_at,
        })
        .from(users)
        .where(and(eq(users.user_id, payload.user_id), eq(users.tenant_id, payload.tenant_id)))
        .limit(1);

      if (!user) {
        return reply.status(404).send({ error: 'User not found' });
      }

      return reply.status(200).send({ user });
    },
  );
}
