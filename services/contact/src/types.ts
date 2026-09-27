import type { FastifyRequest } from 'fastify';

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

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface ContactListQuery extends PaginationQuery {
  q?: string | undefined;
  tags?: string | undefined;
  lifecycle_stage?: string | undefined;
  lead_score_min?: number | undefined;
  lead_score_max?: number | undefined;
}

export interface CreateContactBody {
  full_name?: string;
  email?: string;
  phone?: string;
  company_name?: string;
  tags?: string[];
  lifecycle_stage?: string;
  lead_score?: number;
  lead_score_confidence?: 'high' | 'low';
}

export type UpdateContactBody = CreateContactBody;

export interface DeduplicateResult {
  merged_count: number;
  surviving_contact_ids: string[];
}
