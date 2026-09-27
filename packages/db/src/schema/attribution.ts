import {
  pgTable,
  uuid,
  varchar,
  numeric,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { contacts } from './contacts.js';

export const touchpointChannelEnum = pgEnum('touchpoint_channel', [
  'email',
  'sms',
  'chatbot',
  'call',
  'campaign',
]);

export const attributionModelEnum = pgEnum('attribution_model', [
  'first_touch',
  'last_touch',
  'linear',
]);

// ─── touchpoints ──────────────────────────────────────────────────────────────

export const touchpoints = pgTable('touchpoints', {
  touchpoint_id: uuid('touchpoint_id').primaryKey().defaultRandom(),
  tenant_id:     uuid('tenant_id').notNull().references(() => tenants.tenant_id, { onDelete: 'cascade' }),
  contact_id:    uuid('contact_id').notNull().references(() => contacts.contact_id, { onDelete: 'cascade' }),
  channel:       touchpointChannelEnum('channel').notNull(),
  campaign_id:   uuid('campaign_id'),
  event_type:    varchar('event_type', { length: 100 }).notNull(),
  occurred_at:   timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Touchpoint = typeof touchpoints.$inferSelect;
export type NewTouchpoint = typeof touchpoints.$inferInsert;

// ─── conversion_events ────────────────────────────────────────────────────────

export const conversionEvents = pgTable('conversion_events', {
  conversion_id: uuid('conversion_id').primaryKey().defaultRandom(),
  tenant_id:     uuid('tenant_id').notNull().references(() => tenants.tenant_id, { onDelete: 'cascade' }),
  contact_id:    uuid('contact_id').notNull().references(() => contacts.contact_id, { onDelete: 'cascade' }),
  event_type:    varchar('event_type', { length: 100 }).notNull(),
  occurred_at:   timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ConversionEvent = typeof conversionEvents.$inferSelect;
export type NewConversionEvent = typeof conversionEvents.$inferInsert;

// ─── attribution_results ──────────────────────────────────────────────────────

export const attributionResults = pgTable('attribution_results', {
  result_id:     uuid('result_id').primaryKey().defaultRandom(),
  tenant_id:     uuid('tenant_id').notNull().references(() => tenants.tenant_id, { onDelete: 'cascade' }),
  conversion_id: uuid('conversion_id').notNull().references(() => conversionEvents.conversion_id, { onDelete: 'cascade' }),
  touchpoint_id: uuid('touchpoint_id').notNull().references(() => touchpoints.touchpoint_id, { onDelete: 'cascade' }),
  contact_id:    uuid('contact_id').notNull().references(() => contacts.contact_id, { onDelete: 'cascade' }),
  model:         attributionModelEnum('model').notNull(),
  credit:        numeric('credit', { precision: 5, scale: 4 }).notNull(),
  channel:       touchpointChannelEnum('channel').notNull(),
  campaign_id:   uuid('campaign_id'),
  occurred_at:   timestamp('occurred_at', { withTimezone: true }).notNull(),
  calculated_at: timestamp('calculated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type AttributionResult = typeof attributionResults.$inferSelect;
export type NewAttributionResult = typeof attributionResults.$inferInsert;

// ─── custom_conversion_events ─────────────────────────────────────────────────

export const customConversionEvents = pgTable('custom_conversion_events', {
  custom_event_id: uuid('custom_event_id').primaryKey().defaultRandom(),
  tenant_id:       uuid('tenant_id').notNull().references(() => tenants.tenant_id, { onDelete: 'cascade' }),
  event_type:      varchar('event_type', { length: 100 }).notNull(),
  description:     varchar('description', { length: 255 }),
  created_at:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CustomConversionEvent = typeof customConversionEvents.$inferSelect;
export type NewCustomConversionEvent = typeof customConversionEvents.$inferInsert;
