export interface AuthenticatedContext {
  user_id: string;
  tenant_id: string;
  roles: string[];
}

// Extend Fastify's request type to include auth context
declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthenticatedContext;
  }
}
