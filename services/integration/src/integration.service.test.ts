import { describe, it, expect } from 'vitest';
import { signPayload, computeNextRetry } from './webhook.worker.js';
import { createHash, randomBytes } from 'crypto';

// ─── HMAC signing tests ───────────────────────────────────────────────────────

describe('signPayload', () => {
  it('produces a hex string', () => {
    const sig = signPayload('secret', '{"event":"test"}');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic for same inputs', () => {
    const payload = JSON.stringify({ event: 'contact.created', id: '123' });
    const sig1 = signPayload('my-secret', payload);
    const sig2 = signPayload('my-secret', payload);
    expect(sig1).toBe(sig2);
  });

  it('differs for different secrets', () => {
    const payload = '{"event":"test"}';
    expect(signPayload('secret-a', payload)).not.toBe(signPayload('secret-b', payload));
  });

  it('differs for different payloads', () => {
    const secret = 'shared-secret';
    expect(signPayload(secret, '{"a":1}')).not.toBe(signPayload(secret, '{"a":2}'));
  });
});

// ─── Retry backoff tests ──────────────────────────────────────────────────────

describe('computeNextRetry', () => {
  it('returns a future date for attempt 0', () => {
    const createdAt = new Date();
    const next = computeNextRetry(createdAt, 0);
    expect(next).not.toBeNull();
    expect(next!.getTime()).toBeGreaterThan(Date.now());
  });

  it('returns null when retry would exceed 24 hours from creation', () => {
    // Created 23.9 hours ago — next retry at attempt 8 (4h delay) would exceed 24h
    const createdAt = new Date(Date.now() - 23.9 * 60 * 60 * 1000);
    const next = computeNextRetry(createdAt, 8);
    expect(next).toBeNull();
  });

  it('returns null for very old deliveries', () => {
    const createdAt = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
    const next = computeNextRetry(createdAt, 0);
    expect(next).toBeNull();
  });

  it('delays increase with attempt count', () => {
    const createdAt = new Date();
    const next0 = computeNextRetry(createdAt, 0);
    const next1 = computeNextRetry(createdAt, 1);
    expect(next0).not.toBeNull();
    expect(next1).not.toBeNull();
    expect(next1!.getTime()).toBeGreaterThan(next0!.getTime());
  });
});

// ─── API key hashing tests ────────────────────────────────────────────────────

describe('API key SHA-256 hashing', () => {
  it('SHA-256 hash is 64 hex chars', () => {
    const raw = `pk_${randomBytes(32).toString('hex')}`;
    const hash = createHash('sha256').update(raw).digest('hex');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });

  it('same raw key always produces same hash', () => {
    const raw = 'pk_test_key_12345';
    const h1 = createHash('sha256').update(raw).digest('hex');
    const h2 = createHash('sha256').update(raw).digest('hex');
    expect(h1).toBe(h2);
  });

  it('different raw keys produce different hashes', () => {
    const h1 = createHash('sha256').update('pk_key_a').digest('hex');
    const h2 = createHash('sha256').update('pk_key_b').digest('hex');
    expect(h1).not.toBe(h2);
  });
});

// ─── OpenAPI spec tests ───────────────────────────────────────────────────────

describe('OpenAPI spec', () => {
  it('is a valid OpenAPI 3.0 object', async () => {
    const { openapiSpec } = await import('./openapi.js');
    expect(openapiSpec.openapi).toBe('3.0.3');
    expect(openapiSpec.info.title).toBeTruthy();
    expect(openapiSpec.paths).toBeDefined();
  });

  it('includes all required resource paths', async () => {
    const { openapiSpec } = await import('./openapi.js');
    const paths = Object.keys(openapiSpec.paths);
    expect(paths).toContain('/api-keys');
    expect(paths).toContain('/api-keys/{id}');
    expect(paths).toContain('/webhooks');
    expect(paths).toContain('/webhooks/{id}/deliveries');
    expect(paths).toContain('/integrations');
    expect(paths).toContain('/health');
  });
});

// ─── Adapter stub tests ───────────────────────────────────────────────────────

describe('Native integration adapters', () => {
  it('SlackAdapter.connect() resolves with provider=slack', async () => {
    const { SlackAdapter } = await import('./adapters/slack.js');
    const adapter = new SlackAdapter({ webhookUrl: 'https://hooks.slack.com/test' });
    const result = await adapter.connect();
    expect(result.ok).toBe(true);
    expect(result.provider).toBe('slack');
  });

  it('SlackAdapter.connect() throws without config', async () => {
    const { SlackAdapter } = await import('./adapters/slack.js');
    const adapter = new SlackAdapter({});
    await expect(adapter.connect()).rejects.toThrow('webhookUrl or botToken is required');
  });

  it('HubSpotAdapter.connect() resolves with provider=hubspot', async () => {
    const { HubSpotAdapter } = await import('./adapters/hubspot.js');
    const adapter = new HubSpotAdapter({ accessToken: 'test-token' });
    const result = await adapter.connect();
    expect(result.ok).toBe(true);
    expect(result.provider).toBe('hubspot');
  });

  it('SalesforceAdapter.connect() resolves with provider=salesforce', async () => {
    const { SalesforceAdapter } = await import('./adapters/salesforce.js');
    const adapter = new SalesforceAdapter({
      instanceUrl: 'https://test.salesforce.com',
      accessToken: 'test-token',
    });
    const result = await adapter.connect();
    expect(result.ok).toBe(true);
    expect(result.provider).toBe('salesforce');
  });

  it('ZapierAdapter.connect() resolves with provider=zapier', async () => {
    const { ZapierAdapter } = await import('./adapters/zapier.js');
    const adapter = new ZapierAdapter({ webhookUrl: 'https://hooks.zapier.com/test' });
    const result = await adapter.connect();
    expect(result.ok).toBe(true);
    expect(result.provider).toBe('zapier');
  });

  it('GoogleWorkspaceAdapter.connect() resolves with provider=google-workspace', async () => {
    const { GoogleWorkspaceAdapter } = await import('./adapters/google-workspace.js');
    const adapter = new GoogleWorkspaceAdapter({ serviceAccountKey: { type: 'service_account' } });
    const result = await adapter.connect();
    expect(result.ok).toBe(true);
    expect(result.provider).toBe('google-workspace');
  });
});
