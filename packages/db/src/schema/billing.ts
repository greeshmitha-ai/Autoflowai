import {
  pgTable,
  uuid,
  varchar,
  jsonb,
  timestamp,
  integer,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const subscriptionTierEnum = pgEnum('subscription_tier', [
  'starter',
  'growth',
  'enterprise',
]);

export const subscriptionStatusEnum = pgEnum('subscription_status', [
  'active',
  'past_due',
  'cancelled',
  'suspended',
]);

export const usageResourceEnum = pgEnum('usage_resource', [
  'contacts',
  'call_minutes',
  'sms_sent',
  'ai_tokens',
]);

export const subscriptionPlans = pgTable('subscription_plans', {
  plan_id: uuid('plan_id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  tier: subscriptionTierEnum('tier').notNull(),
  features: jsonb('features').$type<Record<string, unknown>>().notNull().default({}),
  limits: jsonb('limits')
    .$type<{
      contacts?: number;
      call_minutes?: number;
      sms_sent?: number;
      ai_tokens?: number;
    }>()
    .notNull()
    .default({}),
  stripe_price_id: varchar('stripe_price_id', { length: 255 }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type NewSubscriptionPlan = typeof subscriptionPlans.$inferInsert;

export const subscriptions = pgTable('subscriptions', {
  subscription_id: uuid('subscription_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  plan_id: uuid('plan_id')
    .notNull()
    .references(() => subscriptionPlans.plan_id),
  stripe_customer_id: varchar('stripe_customer_id', { length: 255 }).notNull(),
  stripe_subscription_id: varchar('stripe_subscription_id', { length: 255 }).notNull(),
  status: subscriptionStatusEnum('status').notNull().default('active'),
  current_period_start: timestamp('current_period_start', { withTimezone: true }).notNull(),
  current_period_end: timestamp('current_period_end', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;

export const invoices = pgTable('invoices', {
  invoice_id: uuid('invoice_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  stripe_invoice_id: varchar('stripe_invoice_id', { length: 255 }).notNull(),
  amount_cents: integer('amount_cents').notNull(),
  currency: varchar('currency', { length: 10 }).notNull().default('usd'),
  status: varchar('status', { length: 50 }).notNull(),
  pdf_url: varchar('pdf_url', { length: 1000 }),
  period_start: timestamp('period_start', { withTimezone: true }).notNull(),
  period_end: timestamp('period_end', { withTimezone: true }).notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;

export const usageRecords = pgTable('usage_records', {
  record_id: uuid('record_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  resource: usageResourceEnum('resource').notNull(),
  quantity: integer('quantity').notNull(),
  recorded_at: timestamp('recorded_at', { withTimezone: true }).notNull().defaultNow(),
});

export type UsageRecord = typeof usageRecords.$inferSelect;
export type NewUsageRecord = typeof usageRecords.$inferInsert;
