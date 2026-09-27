import { pgTable, uuid, varchar, jsonb, timestamp, pgEnum, type AnyPgColumn } from 'drizzle-orm/pg-core';

export const tenantStatusEnum = pgEnum('tenant_status', ['active', 'suspended', 'deleted']);

export const tenants = pgTable('tenants', {
  tenant_id: uuid('tenant_id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  domain: varchar('domain', { length: 255 }),
  // Self-referential FK for reseller sub-tenants
  parent_tenant_id: uuid('parent_tenant_id').references((): AnyPgColumn => tenants.tenant_id),
  branding: jsonb('branding').$type<{
    logo_url?: string;
    color_scheme?: string;
    product_name?: string;
  }>(),
  plan_id: uuid('plan_id'),
  status: tenantStatusEnum('status').notNull().default('active'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
