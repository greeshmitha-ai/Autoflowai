import type { FastifyRequest } from 'fastify';

/**
 * JWT payload structure for RS256-signed tokens.
 */
export interface JwtPayload {
  user_id: string;
  tenant_id: string;
  roles: string[];
  exp: number;
  iat: number;
}

/**
 * Augmented request context after JWT middleware runs.
 */
export interface AuthenticatedContext {
  user_id: string;
  tenant_id: string;
  roles: string[];
}

// Extend Fastify's request type to include auth context
declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthenticatedContext;
  }
}
