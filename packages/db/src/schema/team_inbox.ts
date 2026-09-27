import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { contacts } from './contacts.js';
import { users } from './users.js';

export const inboxChannelEnum = pgEnum('inbox_channel', [
  'email',
  'sms',
  'live_chat',
  'whatsapp',
  'facebook',
]);

export const inboxStatusEnum = pgEnum('inbox_status', [
  'open',
  'pending',
  'resolved',
  'snoozed',
]);

export const inboxConversations = pgTable('inbox_conversations', {
  inbox_id: uuid('inbox_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  channel: inboxChannelEnum('channel').notNull(),
  contact_id: uuid('contact_id').references(() => contacts.contact_id),
  contact_name: varchar('contact_name', { length: 255 }),
  last_message_preview: text('last_message_preview'),
  last_message_at: timestamp('last_message_at', { withTimezone: true }),
  assigned_to: uuid('assigned_to').references(() => users.user_id),
  status: inboxStatusEnum('status').notNull().default('open'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type InboxConversation = typeof inboxConversations.$inferSelect;
export type NewInboxConversation = typeof inboxConversations.$inferInsert;
