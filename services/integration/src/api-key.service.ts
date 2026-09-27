import { eq, and } from 'drizzle-orm';
import { createHash, randomBytes } from 'crypto';
import { getDb, apiKeys } from '@platform/db';
import type { ApiKey } from '@platform/db';

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/** Generate a raw API key and return both the raw key and its SHA-256 hash. */
function generateApiKey(): { raw: string; hash: string } {
  const raw = `pk_${randomBytes(32).toString('hex')}`;
  const hash = createHash('sha256').update(raw).digest('hex');
  return { raw, hash };
}

export interface CreateApiKeyResult {
  api_key: ApiKey;
  /** Raw key — returned ONLY on creation, never stored. */
  raw_key: string;
}

export async function createApiKey(
  tenantId: string,
  data: { name: string; scopes?: string[] },
): Promise<CreateApiKeyResult> {
  if (!data.name?.trim()) throw new ValidationError('name is required');

  const { raw, hash } = generateApiKey();
  const db = getDb();

  const [key] = await db
    .insert(apiKeys)
    .values({
      tenant_id: tenantId,
      key_hash: hash,
      name: data.name.trim(),
      scopes: data.scopes ?? [],
      status: 'active',
    })
    .returning();

  if (!key) throw new Error('Failed to create API key');

  return { api_key: key, raw_key: raw };
}

export async function listApiKeys(tenantId: string): Promise<ApiKey[]> {
  const db = getDb();
  return db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.tenant_id, tenantId), eq(apiKeys.status, 'active')));
}

export async function revokeApiKey(tenantId: string, apiKeyId: string): Promise<void> {
  const db = getDb();
  const [existing] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.api_key_id, apiKeyId), eq(apiKeys.tenant_id, tenantId)));

  if (!existing) throw new NotFoundError(`API key ${apiKeyId} not found`);

  await db
    .update(apiKeys)
    .set({ status: 'revoked', revoked_at: new Date() })
    .where(and(eq(apiKeys.api_key_id, apiKeyId), eq(apiKeys.tenant_id, tenantId)));
}

/** Verify a raw API key against stored hashes (for API key auth). */
export async function verifyApiKey(raw: string): Promise<ApiKey | null> {
  const hash = createHash('sha256').update(raw).digest('hex');
  const db = getDb();
  const [key] = await db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.key_hash, hash), eq(apiKeys.status, 'active')));

  return key ?? null;
}
