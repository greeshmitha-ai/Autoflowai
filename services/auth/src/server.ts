import Fastify, { type FastifyInstance } from 'fastify';
import type { AuthConfig } from './config.js';
import { LockoutService } from './lockout.js';
import { RefreshTokenStore } from './refresh-store.js';
import { registerRoutes } from './routes/register.js';
import { loginRoutes } from './routes/login.js';
import { refreshRoutes } from './routes/refresh.js';
import { logoutRoutes } from './routes/logout.js';
import { meRoutes } from './routes/me.js';
import { ssoRoutes } from './routes/sso.js';

export function createAuthServer(config: AuthConfig): FastifyInstance {
  const app = Fastify({
    logger: true,
    trustProxy: true,
  });

  const lockout = new LockoutService(config.maxFailedAttempts, config.lockoutTtl);
  const refreshStore = new RefreshTokenStore(config.refreshTokenTtl);

  // Health check — no auth required
  app.get('/health', async (_request, reply) => {
    await reply.status(200).send({ status: 'ok', service: 'auth', timestamp: new Date().toISOString() });
  });

  // Register all auth routes
  registerRoutes(app, config);
  loginRoutes(app, config, lockout, refreshStore);
  refreshRoutes(app, config, refreshStore);
  logoutRoutes(app, refreshStore);
  meRoutes(app, config);
  ssoRoutes(app, config, refreshStore);

  return app;
}

export async function startAuthServer(config: AuthConfig): Promise<FastifyInstance> {
  const app = createAuthServer(config);
  await app.listen({ port: config.port, host: config.host });
  return app;
}
