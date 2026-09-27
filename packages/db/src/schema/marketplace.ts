import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  numeric,
  timestamp,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const extensionStatusEnum = pgEnum('extension_status', [
  'available',
  'under_review',
  'suspended',
]);

export const extensionPricingModelEnum = pgEnum('extension_pricing_model', [
  'free',
  'paid',
  'usage_based',
]);

export const tenantExtensionStatusEnum = pgEnum('tenant_extension_status', [
  'active',
  'uninstalled',
]);

export const extensions = pgTable('extensions', {
  extension_id: uuid('extension_id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  publisher: varchar('publisher', { length: 255 }).notNull(),
  version: varchar('version', { length: 50 }).notNull().default('1.0.0'),
  permissions: text('permissions').array().notNull().default([]),
  pricing_model: extensionPricingModelEnum('pricing_model').notNull().default('free'),
  status: extensionStatusEnum('status').notNull().default('under_review'),
  rating: numeric('rating', { precision: 3, scale: 2 }).notNull().default('0.00'),
  review_count: integer('review_count').notNull().default(0),
  submitted_at: timestamp('submitted_at', { withTimezone: true }),
  reviewed_at: timestamp('reviewed_at', { withTimezone: true }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenantExtensions = pgTable('tenant_extensions', {
  tenant_extension_id: uuid('tenant_extension_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  extension_id: uuid('extension_id')
    .notNull()
    .references(() => extensions.extension_id),
  status: tenantExtensionStatusEnum('status').notNull().default('active'),
  approved_permissions: text('approved_permissions').array().notNull().default([]),
  installed_at: timestamp('installed_at', { withTimezone: true }).notNull().defaultNow(),
  uninstalled_at: timestamp('uninstalled_at', { withTimezone: true }),
});

export type Extension = typeof extensions.$inferSelect;
export type NewExtension = typeof extensions.$inferInsert;
export type TenantExtension = typeof tenantExtensions.$inferSelect;
export type NewTenantExtension = typeof tenantExtensions.$inferInsert;
