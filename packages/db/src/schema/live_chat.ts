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
import { conversations } from './chatbot.js';

export const liveChatSessionStatusEnum = pgEnum('live_chat_session_status', [
  'waiting',
  'active',
  'closed',
]);

export const liveChatSenderTypeEnum = pgEnum('live_chat_sender_type', [
  'customer',
  'operator',
  'system',
]);

// ─── Live Chat Sessions ───────────────────────────────────────────────────────

export const liveChatSessions = pgTable('live_chat_sessions', {
  session_id: uuid('session_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  conversation_id: uuid('conversation_id').references(() => conversations.conversation_id),
  contact_id: uuid('contact_id').references(() => contacts.contact_id),
  assigned_operator_id: uuid('assigned_operator_id').references(() => users.user_id),
  status: liveChatSessionStatusEnum('status').notNull().default('waiting'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  closed_at: timestamp('closed_at', { withTimezone: true }),
});

export type LiveChatSession = typeof liveChatSessions.$inferSelect;
export type NewLiveChatSession = typeof liveChatSessions.$inferInsert;

// ─── Live Chat Messages ───────────────────────────────────────────────────────

export const liveChatMessages = pgTable('live_chat_messages', {
  message_id: uuid('message_id').primaryKey().defaultRandom(),
  session_id: uuid('session_id')
    .notNull()
    .references(() => liveChatSessions.session_id),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  sender_type: liveChatSenderTypeEnum('sender_type').notNull(),
  sender_id: varchar('sender_id', { length: 255 }).notNull(),
  content: text('content').notNull(),
  sent_at: timestamp('sent_at', { withTimezone: true }).notNull().defaultNow(),
});

export type LiveChatMessage = typeof liveChatMessages.$inferSelect;
export type NewLiveChatMessage = typeof liveChatMessages.$inferInsert;

// ─── Canned Responses ─────────────────────────────────────────────────────────

export const cannedResponses = pgTable('canned_responses', {
  canned_response_id: uuid('canned_response_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  title: varchar('title', { length: 255 }).notNull(),
  content: text('content').notNull(),
  created_by: uuid('created_by').references(() => users.user_id),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CannedResponse = typeof cannedResponses.$inferSelect;
export type NewCannedResponse = typeof cannedResponses.$inferInsert;
