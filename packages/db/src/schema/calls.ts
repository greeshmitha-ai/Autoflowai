import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  pgEnum,
  doublePrecision,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { contacts } from './contacts.js';

export const callDirectionEnum = pgEnum('call_direction', ['inbound', 'outbound']);
export const callStatusEnum = pgEnum('call_status', [
  'initiated',
  'connected',
  'completed',
  'failed',
  'voicemail',
]);

export const calls = pgTable('calls', {
  call_id: uuid('call_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  contact_id: uuid('contact_id').references(() => contacts.contact_id),
  direction: callDirectionEnum('direction').notNull(),
  status: callStatusEnum('status').notNull().default('initiated'),
  duration_seconds: integer('duration_seconds'),
  recording_url: varchar('recording_url', { length: 2048 }),
  transcript: text('transcript'),
  sentiment_score: doublePrecision('sentiment_score'),
  is_voice_ai: boolean('is_voice_ai').notNull().default(false),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  ended_at: timestamp('ended_at', { withTimezone: true }),
});

export type Call = typeof calls.$inferSelect;
export type NewCall = typeof calls.$inferInsert;
