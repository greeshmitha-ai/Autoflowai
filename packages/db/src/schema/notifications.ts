import { pgTable, uuid, varchar, jsonb, text, integer, timestamp } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';

// notifications — records of notifications delivered to users
export const notifications = pgTable('notifications', {
  notification_id: uuid('notification_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.user_id),
  event_type: varchar('event_type', { length: 100 }).notNull(),
  payload: jsonb('payload').notNull().default({}),
  channels: text('channels').array().notNull().default([]),
  delivered_at: jsonb('delivered_at').notNull().default({}),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;

// notification_preferences — per-user channel and DND preferences per event type
export const notificationPreferences = pgTable('notification_preferences', {
  pref_id: uuid('pref_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.user_id),
  event_type: varchar('event_type', { length: 100 }).notNull(),
  channels: text('channels').array().notNull().default([]),
  dnd_start_hour: integer('dnd_start_hour'),
  dnd_end_hour: integer('dnd_end_hour'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
export type NewNotificationPreference = typeof notificationPreferences.$inferInsert;

// notification_role_defaults — role-level default preferences set by admins
export const notificationRoleDefaults = pgTable('notification_role_defaults', {
  default_id: uuid('default_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  role: varchar('role', { length: 50 }).notNull(),
  event_type: varchar('event_type', { length: 100 }).notNull(),
  channels: text('channels').array().notNull().default([]),
  dnd_start_hour: integer('dnd_start_hour'),
  dnd_end_hour: integer('dnd_end_hour'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type NotificationRoleDefault = typeof notificationRoleDefaults.$inferSelect;
export type NewNotificationRoleDefault = typeof notificationRoleDefaults.$inferInsert;
