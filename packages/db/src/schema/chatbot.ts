import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  pgEnum,
  jsonb,
  doublePrecision,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { contacts } from './contacts.js';

export const conversationChannelEnum = pgEnum('conversation_channel', [
  'widget',
  'whatsapp',
  'facebook',
  'sms',
  'live_chat',
]);

export const conversationStatusEnum = pgEnum('conversation_status', [
  'open',
  'escalated',
  'closed',
]);

// ─── Agents ───────────────────────────────────────────────────────────────────

export const agents = pgTable('agents', {
  agent_id: uuid('agent_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  name: varchar('name', { length: 255 }).notNull(),
  persona: text('persona').notNull().default(''),
  escalation_threshold: doublePrecision('escalation_threshold').notNull().default(0.5),
  deployment_targets: text('deployment_targets').array().notNull().default([]),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Conversations ────────────────────────────────────────────────────────────

export const conversations = pgTable('conversations', {
  conversation_id: uuid('conversation_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  contact_id: uuid('contact_id').references(() => contacts.contact_id),
  agent_id: uuid('agent_id').references(() => agents.agent_id),
  channel: conversationChannelEnum('channel').notNull().default('widget'),
  status: conversationStatusEnum('status').notNull().default('open'),
  transcript: jsonb('transcript').$type<TranscriptEntry[]>().notNull().default([]),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  closed_at: timestamp('closed_at', { withTimezone: true }),
});

// ─── Knowledge Base ───────────────────────────────────────────────────────────

export const knowledgeBase = pgTable('knowledge_base', {
  kb_id: uuid('kb_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  agent_id: uuid('agent_id')
    .notNull()
    .references(() => agents.agent_id),
  filename: varchar('filename', { length: 500 }).notNull(),
  s3_key: varchar('s3_key', { length: 1000 }).notNull(),
  status: varchar('status', { length: 50 }).notNull().default('pending'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  indexed_at: timestamp('indexed_at', { withTimezone: true }),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TranscriptEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  confidence?: number;
}

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type KnowledgeBase = typeof knowledgeBase.$inferSelect;
export type NewKnowledgeBase = typeof knowledgeBase.$inferInsert;
