import {
  pgTable,
  uuid,
  varchar,
  text,
  jsonb,
  timestamp,
  integer,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const apiKeyStatusEnum = pgEnum('api_key_status', ['active', 'revoked']);
export const webhookStatusEnum = pgEnum('webhook_status', ['active', 'inactive']);
export const webhookDeliveryStatusEnum = pgEnum('webhook_delivery_status', ['pending', 'delivered', 'failed']);
export const integrationStatusEnum = pgEnum('integration_status', ['active', 'inactive', 'error']);

export const apiKeys = pgTable('api_keys', {
  api_key_id: uuid('api_key_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  key_hash: varchar('key_hash', { length: 64 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  scopes: text('scopes').array().notNull().default([]),
  status: apiKeyStatusEnum('status').notNull().default('active'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revoked_at: timestamp('revoked_at', { withTimezone: true }),
});

export const webhooks = pgTable('webhooks', {
  webhook_id: uuid('webhook_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  url: varchar('url', { length: 2048 }).notNull(),
  events: text('events').array().notNull().default([]),
  secret: varchar('secret', { length: 255 }).notNull(),
  status: webhookStatusEnum('status').notNull().default('active'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const webhookDeliveries = pgTable('webhook_deliveries', {
  delivery_id: uuid('delivery_id').primaryKey().defaultRandom(),
  webhook_id: uuid('webhook_id')
    .notNull()
    .references(() => webhooks.webhook_id),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  event_type: varchar('event_type', { length: 255 }).notNull(),
  payload: jsonb('payload').notNull().default({}),
  status: webhookDeliveryStatusEnum('status').notNull().default('pending'),
  attempts: integer('attempts').notNull().default(0),
  next_retry_at: timestamp('next_retry_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const integrations = pgTable('integrations', {
  integration_id: uuid('integration_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  provider: varchar('provider', { length: 100 }).notNull(),
  name: varchar('name', { length: 255 }).notNull(),
  config: jsonb('config').notNull().default({}),
  status: integrationStatusEnum('status').notNull().default('inactive'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;
export type Integration = typeof integrations.$inferSelect;
export type NewIntegration = typeof integrations.$inferInsert;
