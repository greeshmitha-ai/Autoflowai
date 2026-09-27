import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import bcrypt from 'bcrypt';
import { eq, and } from 'drizzle-orm';
import { getDb } from '@platform/db';
import { users, tenants } from '@platform/db';
import type { AuthConfig } from '../config.js';

interface RegisterBody {
  email: string;
  password: string;
  tenant_id: string;
  roles?: string[];
}

export function registerRoutes(app: FastifyInstance, config: AuthConfig): void {
  app.post<{ Body: RegisterBody }>(
    '/auth/register',
    {
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password', 'tenant_id'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            tenant_id: { type: 'string', format: 'uuid' },
            roles: { type: 'array', items: { type: 'string' } },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: RegisterBody }>, reply: FastifyReply) => {
      const { email, password, tenant_id, roles = ['member'] } = request.body;

      const db = getDb();

      // Verify tenant exists and is active
      const [tenant] = await db
        .select()
        .from(tenants)
        .where(and(eq(tenants.tenant_id, tenant_id), eq(tenants.status, 'active')))
        .limit(1);

      if (!tenant) {
        return reply.status(404).send({ error: 'Tenant not found or inactive' });
      }

      // Check for duplicate email within tenant
      const [existing] = await db
        .select({ user_id: users.user_id })
        .from(users)
        .where(and(eq(users.tenant_id, tenant_id), eq(users.email, email.toLowerCase())))
        .limit(1);

      if (existing) {
        return reply.status(409).send({ error: 'Email already registered for this tenant' });
      }

      // Hash password with bcrypt (cost factor from config, minimum 12)
      const password_hash = await bcrypt.hash(password, config.bcryptCostFactor);

      const [newUser] = await db
        .insert(users)
        .values({
          tenant_id,
          email: email.toLowerCase(),
          password_hash,
          roles,
          status: 'active',
        })
        .returning({
          user_id: users.user_id,
          tenant_id: users.tenant_id,
          email: users.email,
          roles: users.roles,
          status: users.status,
          created_at: users.created_at,
        });

      return reply.status(201).send({ user: newUser });
    },
  );
}
