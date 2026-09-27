import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';
import { users } from './users.js';
import { contacts } from './contacts.js';

// We reference deals table by name to avoid circular imports
// deals is defined in crm.ts

export const taskPriorityEnum = pgEnum('task_priority', ['low', 'medium', 'high', 'urgent']);
export const taskStatusEnum = pgEnum('task_status', ['open', 'completed', 'overdue']);

export const tasks = pgTable('tasks', {
  task_id: uuid('task_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  title: varchar('title', { length: 255 }).notNull(),
  description: text('description'),
  due_date: timestamp('due_date', { withTimezone: true }),
  priority: taskPriorityEnum('priority').notNull().default('medium'),
  assigned_to: uuid('assigned_to')
    .notNull()
    .references(() => users.user_id),
  contact_id: uuid('contact_id').references(() => contacts.contact_id),
  deal_id: uuid('deal_id'),
  status: taskStatusEnum('status').notNull().default('open'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

export const bookingSlots = pgTable('booking_slots', {
  slot_id: uuid('slot_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  user_id: uuid('user_id')
    .notNull()
    .references(() => users.user_id),
  start_time: timestamp('start_time', { withTimezone: true }).notNull(),
  end_time: timestamp('end_time', { withTimezone: true }).notNull(),
  is_available: boolean('is_available').notNull().default(true),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type BookingSlot = typeof bookingSlots.$inferSelect;
export type NewBookingSlot = typeof bookingSlots.$inferInsert;

export const bookings = pgTable('bookings', {
  booking_id: uuid('booking_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  slot_id: uuid('slot_id')
    .notNull()
    .references(() => bookingSlots.slot_id),
  contact_id: uuid('contact_id').references(() => contacts.contact_id),
  customer_email: varchar('customer_email', { length: 255 }).notNull(),
  customer_name: varchar('customer_name', { length: 255 }).notNull(),
  booking_token: varchar('booking_token', { length: 255 }).notNull().unique(),
  confirmed_at: timestamp('confirmed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
