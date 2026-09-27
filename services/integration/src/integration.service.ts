import { eq, and } from 'drizzle-orm';
import { getDb, integrations } from '@platform/db';
import type { Integration } from '@platform/db';

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

const SUPPORTED_PROVIDERS = ['slack', 'hubspot', 'salesforce', 'zapier', 'google-workspace'] as const;
type Provider = (typeof SUPPORTED_PROVIDERS)[number];

function isSupportedProvider(p: string): p is Provider {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(p);
}

export async function createIntegration(
  tenantId: string,
  data: { provider: string; name: string; config: Record<string, unknown> },
): Promise<Integration> {
  if (!data.provider?.trim()) throw new ValidationError('provider is required');
  if (!isSupportedProvider(data.provider)) {
    throw new ValidationError(
      `Unsupported provider. Supported: ${SUPPORTED_PROVIDERS.join(', ')}`,
    );
  }
  if (!data.name?.trim()) throw new ValidationError('name is required');

  const db = getDb();
  const [integration] = await db
    .insert(integrations)
    .values({
      tenant_id: tenantId,
      provider: data.provider,
      name: data.name.trim(),
      config: data.config ?? {},
      status: 'inactive',
    })
    .returning();

  if (!integration) throw new Error('Failed to create integration');
  return integration;
}

export async function listIntegrations(tenantId: string): Promise<Integration[]> {
  const db = getDb();
  return db.select().from(integrations).where(eq(integrations.tenant_id, tenantId));
}

export async function getIntegration(tenantId: string, integrationId: string): Promise<Integration> {
  const db = getDb();
  const [integration] = await db
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.integration_id, integrationId),
        eq(integrations.tenant_id, tenantId),
      ),
    );

  if (!integration) throw new NotFoundError(`Integration ${integrationId} not found`);
  return integration;
}

export async function updateIntegrationStatus(
  tenantId: string,
  integrationId: string,
  status: 'active' | 'inactive' | 'error',
): Promise<Integration> {
  const db = getDb();
  const [updated] = await db
    .update(integrations)
    .set({ status, updated_at: new Date() })
    .where(
      and(
        eq(integrations.integration_id, integrationId),
        eq(integrations.tenant_id, tenantId),
      ),
    )
    .returning();

  if (!updated) throw new NotFoundError(`Integration ${integrationId} not found`);
  return updated;
}
