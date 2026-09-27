import type { FastifyRequest } from 'fastify';

export interface PortalJwtPayload {
  contact_id: string;
  tenant_id: string;
  email: string;
  session_id: string;
  exp: number;
  iat: number;
}

declare module 'fastify' {
  interface FastifyRequest {
    portalAuth?: {
      contact_id: string;
      tenant_id: string;
      email: string;
      session_id: string;
    };
  }
}

export type { FastifyRequest };
