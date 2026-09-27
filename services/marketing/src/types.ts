import type { FastifyRequest } from 'fastify';

export interface AuthenticatedContext {
  user_id: string;
  tenant_id: string;
  roles: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    auth?: AuthenticatedContext;
  }
}

export interface CreateCampaignBody {
  name: string;
  channel: 'email' | 'sms' | 'in_app';
  audience_filter?: Record<string, unknown>;
  scheduled_at?: string;
  template_id?: string;
}

export interface UpdateCampaignBody {
  name?: string;
  channel?: 'email' | 'sms' | 'in_app';
  audience_filter?: Record<string, unknown>;
  scheduled_at?: string | null;
  template_id?: string | null;
  status?: 'draft' | 'scheduled' | 'sending' | 'completed' | 'cancelled';
}

export interface SendCampaignBody {
  scheduled_at?: string;
}

export interface CreateTemplateBody {
  name: string;
  html_content?: string;
  text_content?: string;
}

export interface UpdateTemplateBody {
  name?: string;
  html_content?: string;
  text_content?: string;
}
