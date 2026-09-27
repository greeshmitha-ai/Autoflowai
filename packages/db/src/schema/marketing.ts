import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  jsonb,
  unique,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { contacts } from './contacts.js';
import { users } from './users.js';

export const campaignChannelEnum = pgEnum('campaign_channel', ['email', 'sms', 'in_app']);
export const campaignStatusEnum = pgEnum('campaign_status', [
  'draft',
  'scheduled',
  'sending',
  'completed',
  'cancelled',
]);
export const deliveryStatusEnum = pgEnum('delivery_status', [
  'pending',
  'sent',
  'delivered',
  'opened',
  'clicked',
  'bounced',
  'unsubscribed',
]);

export const emailTemplates = pgTable('email_templates', {
  template_id: uuid('template_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  name: varchar('name', { length: 255 }).notNull(),
  html_content: text('html_content').notNull().default(''),
  text_content: text('text_content').notNull().default(''),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const campaigns = pgTable('campaigns', {
  campaign_id: uuid('campaign_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  name: varchar('name', { length: 255 }).notNull(),
  channel: campaignChannelEnum('channel').notNull().default('email'),
  status: campaignStatusEnum('status').notNull().default('draft'),
  audience_filter: jsonb('audience_filter')
    .$type<AudienceFilter>()
    .notNull()
    .default({} as AudienceFilter),
  scheduled_at: timestamp('scheduled_at', { withTimezone: true }),
  template_id: uuid('template_id').references(() => emailTemplates.template_id),
  created_by: uuid('created_by').references(() => users.user_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const campaignDeliveries = pgTable(
  'campaign_deliveries',
  {
    delivery_id: uuid('delivery_id').primaryKey().defaultRandom(),
    campaign_id: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.campaign_id),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.tenant_id),
    contact_id: uuid('contact_id')
      .notNull()
      .references(() => contacts.contact_id),
    status: deliveryStatusEnum('status').notNull().default('pending'),
    sent_at: timestamp('sent_at', { withTimezone: true }),
    opened_at: timestamp('opened_at', { withTimezone: true }),
    clicked_at: timestamp('clicked_at', { withTimezone: true }),
    bounced_at: timestamp('bounced_at', { withTimezone: true }),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: unique().on(t.campaign_id, t.contact_id),
  }),
);

export const contactUnsubscribes = pgTable(
  'contact_unsubscribes',
  {
    unsubscribe_id: uuid('unsubscribe_id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.tenant_id),
    contact_id: uuid('contact_id')
      .notNull()
      .references(() => contacts.contact_id),
    channel: campaignChannelEnum('channel').notNull().default('email'),
    campaign_id: uuid('campaign_id').references(() => campaigns.campaign_id),
    unsubscribed_at: timestamp('unsubscribed_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    uniq: unique().on(t.tenant_id, t.contact_id, t.channel),
  }),
);

// ─── Audience filter types ────────────────────────────────────────────────────

export interface FieldFilter {
  field: string;
  operator: 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte';
  value: string | number | boolean;
}

export interface AudienceFilter {
  logic?: 'and' | 'or';
  filters?: FieldFilter[];
  tags?: string[];
  lifecycle_stages?: string[];
  lead_score_min?: number;
  lead_score_max?: number;
}

export type Campaign = typeof campaigns.$inferSelect;
export type NewCampaign = typeof campaigns.$inferInsert;
export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type NewEmailTemplate = typeof emailTemplates.$inferInsert;
export type CampaignDelivery = typeof campaignDeliveries.$inferSelect;
export type NewCampaignDelivery = typeof campaignDeliveries.$inferInsert;
export type ContactUnsubscribe = typeof contactUnsubscribes.$inferSelect;
export type NewContactUnsubscribe = typeof contactUnsubscribes.$inferInsert;
