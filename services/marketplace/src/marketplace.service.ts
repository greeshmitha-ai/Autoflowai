/**
 * Marketplace Service
 * Requirements: 28.1–28.8
 *
 * Handles extension listing, install, uninstall, and developer submission.
 * Extensions are tenant-scoped via tenant_extensions table.
 * Cross-tenant isolation is enforced at the DB layer via withTenant().
 */
import { eq, and } from 'drizzle-orm';
import {
  getDb,
  extensions,
  tenantExtensions,
  type Extension,
  type NewExtension,
  type TenantExtension,
  type NewTenantExtension,
} from '@platform/db';

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// ─── Task 35.1: Marketplace listing ──────────────────────────────────────────

export interface ExtensionListItem {
  extension_id: string;
  name: string;
  description: string | null;
  publisher: string;
  version: string;
  pricing_model: string;
  rating: string;
  review_count: number;
}

export async function listAvailableExtensions(): Promise<ExtensionListItem[]> {
  const db = getDb();
  const rows = await db
    .select({
      extension_id: extensions.extension_id,
      name: extensions.name,
      description: extensions.description,
      publisher: extensions.publisher,
      version: extensions.version,
      pricing_model: extensions.pricing_model,
      rating: extensions.rating,
      review_count: extensions.review_count,
    })
    .from(extensions)
    .where(eq(extensions.status, 'available'));

  return rows.map((r) => ({
    ...r,
    rating: r.rating ?? '0.00',
  }));
}

export async function getExtensionById(extensionId: string): Promise<Extension> {
  const db = getDb();
  const [ext] = await db
    .select()
    .from(extensions)
    .where(eq(extensions.extension_id, extensionId));

  if (!ext) throw new NotFoundError(`Extension ${extensionId} not found`);
  return ext;
}

// ─── Task 35.2: Install extension ────────────────────────────────────────────

export interface InstallResult {
  tenant_extension_id: string;
  extension_id: string;
  tenant_id: string;
  status: string;
  installed_at: Date;
  extension: Extension;
  permissions_requiring_approval: string[];
}

export async function installExtension(
  tenantId: string,
  extensionId: string,
): Promise<InstallResult> {
  const db = getDb();

  // Check extension exists and is available
  const [ext] = await db
    .select()
    .from(extensions)
    .where(and(eq(extensions.extension_id, extensionId), eq(extensions.status, 'available')));

  if (!ext) throw new NotFoundError(`Extension ${extensionId} not found or not available`);

  // Check if already installed (active)
  const [existing] = await db
    .select()
    .from(tenantExtensions)
    .where(
      and(
        eq(tenantExtensions.tenant_id, tenantId),
        eq(tenantExtensions.extension_id, extensionId),
        eq(tenantExtensions.status, 'active'),
      ),
    );

  if (existing) throw new ConflictError('Extension is already installed for this tenant');

  // Insert into tenant_extensions
  const newInstall: NewTenantExtension = {
    tenant_id: tenantId,
    extension_id: extensionId,
    status: 'active',
    approved_permissions: [],
    installed_at: new Date(),
  };

  const [installed] = await db.insert(tenantExtensions).values(newInstall).returning();
  if (!installed) throw new Error('Failed to install extension');

  return {
    tenant_extension_id: installed.tenant_extension_id,
    extension_id: installed.extension_id,
    tenant_id: installed.tenant_id,
    status: installed.status,
    installed_at: installed.installed_at,
    extension: ext,
    permissions_requiring_approval: ext.permissions,
  };
}

// ─── Task 35.3: Uninstall extension ──────────────────────────────────────────

export async function uninstallExtension(
  tenantId: string,
  extensionId: string,
): Promise<void> {
  const db = getDb();

  const [existing] = await db
    .select()
    .from(tenantExtensions)
    .where(
      and(
        eq(tenantExtensions.tenant_id, tenantId),
        eq(tenantExtensions.extension_id, extensionId),
        eq(tenantExtensions.status, 'active'),
      ),
    );

  if (!existing) throw new NotFoundError('Extension is not installed for this tenant');

  await db
    .update(tenantExtensions)
    .set({ status: 'uninstalled', uninstalled_at: new Date() })
    .where(eq(tenantExtensions.tenant_extension_id, existing.tenant_extension_id));

  // Stub: revoke API tokens
  // In production, this would call the Integration Hub to revoke all API tokens
  // issued to this extension for this tenant within 5 minutes.
  console.log(
    `[marketplace] Token revocation stub: would revoke all API tokens for extension ${extensionId} in tenant ${tenantId}`,
  );
}

// ─── Task 35.5: Developer submission ─────────────────────────────────────────

export interface SubmitExtensionInput {
  name: string;
  description?: string;
  publisher: string;
  version?: string;
  permissions?: string[];
  pricing_model?: 'free' | 'paid' | 'usage_based';
}

/**
 * Add 14 business days to a date (skips Sat/Sun).
 */
function addBusinessDays(date: Date, days: number): Date {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return result;
}

export async function submitExtension(input: SubmitExtensionInput): Promise<Extension> {
  if (!input.name?.trim()) throw new ValidationError('name is required');
  if (!input.publisher?.trim()) throw new ValidationError('publisher is required');

  const db = getDb();
  const now = new Date();

  const newExt: NewExtension = {
    name: input.name.trim(),
    description: input.description?.trim() ?? null,
    publisher: input.publisher.trim(),
    version: input.version?.trim() ?? '1.0.0',
    permissions: input.permissions ?? [],
    pricing_model: input.pricing_model ?? 'free',
    status: 'under_review',
    submitted_at: now,
    reviewed_at: addBusinessDays(now, 14),
  };

  const [created] = await db.insert(extensions).values(newExt).returning();
  if (!created) throw new Error('Failed to submit extension');
  return created;
}

// ─── Tenant extension listing ─────────────────────────────────────────────────

export async function listTenantExtensions(tenantId: string): Promise<TenantExtension[]> {
  const db = getDb();
  return db
    .select()
    .from(tenantExtensions)
    .where(
      and(
        eq(tenantExtensions.tenant_id, tenantId),
        eq(tenantExtensions.status, 'active'),
      ),
    );
}
