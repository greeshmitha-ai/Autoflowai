import { describe, it, expect } from 'vitest';
import {
  StubContentAiAdapter,
  UnavailableContentAiAdapter,
  truncateSms,
  extractMergeFields,
} from './ai-adapter.js';
import { createContentAssistantServer } from './server.js';
import type { ContentAssistantConfig } from './config.js';

// ─── Test config (no JWT enforcement) ────────────────────────────────────────

const testConfig: ContentAssistantConfig = {
  port: 3099,
  host: '127.0.0.1',
  jwtPublicKey: '', // skip JWT in tests
  aiProvider: 'stub',
  aiApiKey: '',
  aiModel: 'stub',
  generationTimeoutMs: 5000,
};

// Inject auth manually since JWT is disabled in tests
function makeApp(overrides: Partial<ContentAssistantConfig> = {}) {
  const app = createContentAssistantServer({ ...testConfig, ...overrides });
  // Inject a fake auth context for all requests
  app.addHook('preHandler', async (request) => {
    if (!request.auth) {
      request.auth = { user_id: 'user-1', tenant_id: 'tenant-1', roles: ['member'] };
    }
  });
  return app;
}

// ─── truncateSms ──────────────────────────────────────────────────────────────

describe('truncateSms', () => {
  it('returns message unchanged when ≤160 chars', () => {
    const msg = 'Hello {{first_name}}! Check out our offer. Reply STOP to opt out.';
    expect(msg.length).toBeLessThanOrEqual(160);
    expect(truncateSms(msg)).toBe(msg);
  });

  it('truncates message to ≤160 chars when over limit', () => {
    const long = 'A'.repeat(200);
    const result = truncateSms(long);
    expect(result.length).toBeLessThanOrEqual(160);
  });

  it('truncates at word boundary when possible', () => {
    const msg = 'Hello world ' + 'x'.repeat(160);
    const result = truncateSms(msg);
    expect(result.length).toBeLessThanOrEqual(160);
    expect(result.endsWith('...')).toBe(true);
  });

  it('handles exactly 160 chars without truncation', () => {
    const msg = 'A'.repeat(160);
    expect(truncateSms(msg)).toBe(msg);
    expect(truncateSms(msg).length).toBe(160);
  });

  it('handles 161 chars by truncating', () => {
    const msg = 'A'.repeat(161);
    const result = truncateSms(msg);
    expect(result.length).toBeLessThanOrEqual(160);
  });
});

// ─── extractMergeFields ───────────────────────────────────────────────────────

describe('extractMergeFields', () => {
  it('extracts single merge field', () => {
    expect(extractMergeFields('Hello {{first_name}}!')).toEqual(['{{first_name}}']);
  });

  it('extracts multiple distinct merge fields', () => {
    const fields = extractMergeFields('Hi {{first_name}} from {{company_name}}');
    expect(fields).toContain('{{first_name}}');
    expect(fields).toContain('{{company_name}}');
    expect(fields.length).toBe(2);
  });

  it('deduplicates repeated merge fields', () => {
    const fields = extractMergeFields('{{first_name}} and {{first_name}} again');
    expect(fields).toEqual(['{{first_name}}']);
  });

  it('returns empty array when no merge fields', () => {
    expect(extractMergeFields('No placeholders here')).toEqual([]);
  });

  it('does not match invalid placeholder formats', () => {
    expect(extractMergeFields('{{ invalid }} or {single}')).toEqual([]);
  });
});

// ─── StubContentAiAdapter ─────────────────────────────────────────────────────

describe('StubContentAiAdapter', () => {
  const adapter = new StubContentAiAdapter();

  it('is available', () => {
    expect(adapter.isAvailable()).toBe(true);
  });

  it('generates email with subject and body', async () => {
    const draft = await adapter.generateEmail('increase sales', 'SMB owners', 'professional', 0);
    expect(draft.subject.length).toBeGreaterThan(0);
    expect(draft.body.length).toBeGreaterThan(0);
  });

  it('generates different email variants for different regeneration indices', async () => {
    const draft0 = await adapter.generateEmail('grow revenue', 'startups', 'casual', 0);
    const draft1 = await adapter.generateEmail('grow revenue', 'startups', 'casual', 1);
    expect(draft0.subject).not.toBe(draft1.subject);
  });

  it('email body contains merge field placeholders', async () => {
    const draft = await adapter.generateEmail('boost engagement', 'marketers', 'friendly', 0);
    expect(draft.body).toMatch(/\{\{[a-z_]+\}\}/);
  });

  it('generates SMS ≤160 characters', async () => {
    const draft = await adapter.generateSms('join our webinar', 'tech professionals', 0);
    expect(draft.message.length).toBeLessThanOrEqual(160);
  });

  it('generates different SMS variants for different regeneration indices', async () => {
    const sms0 = await adapter.generateSms('buy now', 'VIP customers', 0);
    const sms1 = await adapter.generateSms('buy now', 'VIP customers', 1);
    expect(sms0.message).not.toBe(sms1.message);
  });

  it('generates chatbot script with all required fields', async () => {
    const script = await adapter.generateChatbotScript('lead qualification', 0);
    expect(script.greeting.length).toBeGreaterThan(0);
    expect(Array.isArray(script.qualification_questions)).toBe(true);
    expect(script.qualification_questions.length).toBeGreaterThan(0);
    expect(script.closing.length).toBeGreaterThan(0);
  });

  it('chatbot script contains merge field placeholders', async () => {
    const script = await adapter.generateChatbotScript('product demo', 0);
    const allText = [script.greeting, ...script.qualification_questions, script.closing].join(' ');
    expect(allText).toMatch(/\{\{[a-z_]+\}\}/);
  });

  it('supports all 5 regeneration indices (0-4)', async () => {
    for (let i = 0; i <= 4; i++) {
      const email = await adapter.generateEmail('test', 'test', 'professional', i);
      expect(email.subject.length).toBeGreaterThan(0);
      const sms = await adapter.generateSms('test', 'test', i);
      expect(sms.message.length).toBeGreaterThan(0);
      const script = await adapter.generateChatbotScript('test', i);
      expect(script.greeting.length).toBeGreaterThan(0);
    }
  });
});

// ─── UnavailableContentAiAdapter ─────────────────────────────────────────────

describe('UnavailableContentAiAdapter', () => {
  const adapter = new UnavailableContentAiAdapter();

  it('reports as unavailable', () => {
    expect(adapter.isAvailable()).toBe(false);
  });

  it('throws on generateEmail', async () => {
    await expect(adapter.generateEmail('', '', '', 0)).rejects.toThrow('unavailable');
  });
});

// ─── HTTP endpoints ───────────────────────────────────────────────────────────

describe('POST /content/email', () => {
  it('returns 200 with email draft', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/content/email',
      payload: { goal: 'increase signups', audience: 'developers', tone: 'professional' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.type).toBe('email');
    expect(body.draft.subject).toBeTruthy();
    expect(body.draft.body).toBeTruthy();
    expect(Array.isArray(body.merge_fields)).toBe(true);
  });

  it('returns 400 when goal is missing', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/content/email',
      payload: { audience: 'developers', tone: 'professional' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for invalid tone', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/content/email',
      payload: { goal: 'test', audience: 'test', tone: 'angry' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 for out-of-range regeneration_index', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/content/email',
      payload: { goal: 'test', audience: 'test', tone: 'casual', regeneration_index: 5 },
    });
    expect(res.statusCode).toBe(400);
  });

  it('accepts regeneration_index 0-4', async () => {
    const app = makeApp();
    for (const idx of [0, 1, 2, 3, 4]) {
      const res = await app.inject({
        method: 'POST',
        url: '/content/email',
        payload: { goal: 'test', audience: 'test', tone: 'casual', regeneration_index: idx },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().regeneration_index).toBe(idx);
    }
  });

  it('returns 503 when AI is unavailable', async () => {
    const app = createContentAssistantServer(testConfig);
    // Override the AI adapter to unavailable
    const { UnavailableContentAiAdapter } = await import('./ai-adapter.js');
    const unavailableAi = new UnavailableContentAiAdapter();
    app.addHook('preHandler', async (request) => {
      if (!request.auth) {
        request.auth = { user_id: 'user-1', tenant_id: 'tenant-1', roles: ['member'] };
      }
    });
    const { registerContentRoutes } = await import('./routes/content.js');
    // Re-register with unavailable adapter on a fresh app
    const Fastify = (await import('fastify')).default;
    const freshApp = Fastify({ logger: false });
    freshApp.addHook('preHandler', async (request) => {
      request.auth = { user_id: 'user-1', tenant_id: 'tenant-1', roles: ['member'] };
    });
    registerContentRoutes(freshApp, unavailableAi, testConfig);

    const res = await freshApp.inject({
      method: 'POST',
      url: '/content/email',
      payload: { goal: 'test', audience: 'test', tone: 'professional' },
    });
    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.error).toBe('Service Unavailable');
    expect('partial_draft' in body).toBe(true);
  });
});

describe('POST /content/sms', () => {
  it('returns 200 with SMS draft ≤160 chars', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/content/sms',
      payload: { objective: 'join our flash sale', segment_context: 'loyal customers' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.type).toBe('sms');
    expect(body.draft.message.length).toBeLessThanOrEqual(160);
    expect(body.draft.character_count).toBeLessThanOrEqual(160);
    expect(body.draft.character_count).toBe(body.draft.message.length);
  });

  it('returns 400 when objective is missing', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/content/sms',
      payload: { segment_context: 'test' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('includes merge fields in response', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/content/sms',
      payload: { objective: 'get a discount', segment_context: 'new users' },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().merge_fields)).toBe(true);
  });
});

describe('POST /content/chatbot-script', () => {
  it('returns 200 with chatbot script', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/content/chatbot-script',
      payload: { use_case: 'product demo scheduling' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.type).toBe('chatbot-script');
    expect(body.draft.greeting).toBeTruthy();
    expect(Array.isArray(body.draft.qualification_questions)).toBe(true);
    expect(body.draft.qualification_questions.length).toBeGreaterThan(0);
    expect(body.draft.closing).toBeTruthy();
  });

  it('returns 400 when use_case is missing', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/content/chatbot-script',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });

  it('includes merge fields in response', async () => {
    const app = makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/content/chatbot-script',
      payload: { use_case: 'support ticket triage' },
    });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().merge_fields)).toBe(true);
    expect(res.json().merge_fields.length).toBeGreaterThan(0);
  });
});

describe('GET /health', () => {
  it('returns 200 with service name', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json().service).toBe('content-assistant');
  });
});
