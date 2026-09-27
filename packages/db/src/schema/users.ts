import { pgTable, uuid, varchar, text, timestamp, pgEnum } from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const userStatusEnum = pgEnum('user_status', ['active', 'locked', 'suspended']);

export const users = pgTable('users', {
  user_id: uuid('user_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').notNull().references(() => tenants.tenant_id),
  email: varchar('email', { length: 320 }).notNull(),
  password_hash: varchar('password_hash', { length: 255 }).notNull(),
  roles: text('roles').array().notNull().default([]),
  status: userStatusEnum('status').notNull().default('active'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
