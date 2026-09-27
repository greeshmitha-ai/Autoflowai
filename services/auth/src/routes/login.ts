import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import { eq, and } from 'drizzle-orm';
import { getDb } from '@platform/db';
import { users } from '@platform/db';
import type { AuthConfig } from '../config.js';
import { issueTokens } from '../token.js';
import { LockoutService } from '../lockout.js';
import { RefreshTokenStore } from '../refresh-store.js';

interface LoginBody {
  email: string;
  password: string;
  tenant_id: string;
}

export function loginRoutes(
  app: FastifyInstance,
  config: AuthConfig,
  lockout: LockoutService,
  refreshStore: RefreshTokenStore,
): void {
  app.post<{ Body: LoginBody }>(
    '/auth/login',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password', 'tenant_id'],
          properties: {
            email: { type: 'string' },
            password: { type: 'string' },
            tenant_id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: LoginBody }>, reply: FastifyReply) => {
      const { email, password, tenant_id } = request.body;
      const normalizedEmail = email.toLowerCase();

      // Check lockout before any DB query
      const locked = await lockout.isLockedOut(tenant_id, normalizedEmail);
      if (locked) {
        return reply.status(423).send({
          error: 'Account locked',
          message: 'Too many failed login attempts. Try again in 15 minutes.',
        });
      }

      const db = getDb();

      // Fetch user
      const [user] = await db
        .select()
        .from(users)
        .where(and(eq(users.tenant_id, tenant_id), eq(users.email, normalizedEmail)))
        .limit(1);

      // Use constant-time comparison to prevent timing attacks
      const dummyHash = '$2b$12$invalidhashfortimingprotection000000000000000000000000';
      const hashToCompare = user?.password_hash ?? dummyHash;
      const passwordMatch = await bcrypt.compare(password, hashToCompare);

      if (!user || !passwordMatch) {
        if (user) {
          await lockout.recordFailedAttempt(tenant_id, normalizedEmail);
        }
        return reply.status(401).send({ error: 'Invalid credentials' });
      }

      if (user.status === 'locked') {
        return reply.status(423).send({ error: 'Account is locked' });
      }

      if (user.status === 'suspended') {
        return reply.status(403).send({ error: 'Account is suspended' });
      }

      // Clear any previous failed attempts on successful login
      await lockout.clearAttempts(tenant_id, normalizedEmail);

      const tokens = issueTokens(
        { user_id: user.user_id, tenant_id: user.tenant_id, roles: user.roles },
        config,
      );

      // Store refresh token in Redis
      await refreshStore.save(tokens.refreshToken, {
        user_id: user.user_id,
        tenant_id: user.tenant_id,
        roles: user.roles,
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
