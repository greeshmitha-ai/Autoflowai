import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    auth: {
      user_id: string;
      tenant_id: string;
      roles: string[];
    };
  }

  interface FastifyContextConfig {
    skipAuth?: boolean;
  }
}
