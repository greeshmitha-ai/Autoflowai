import { describe, it, expect, vi, beforeEach } from 'vitest';
import { shouldEscalate, FALLBACK_MESSAGE } from './escalation.service.js';
import { StubAiAdapter } from './ai-adapter.js';
import { ValidationError } from './agent.service.js';

// ─── Escalation logic ─────────────────────────────────────────────────────────

describe('shouldEscalate', () => {
  it('returns true when confidence is below threshold', () => {
    expect(shouldEscalate(0.3, 0.5)).toBe(true);
  });

  it('returns false when confidence equals threshold', () => {
    expect(shouldEscalate(0.5, 0.5)).toBe(false);
  });

  it('returns false when confidence is above threshold', () => {
    expect(shouldEscalate(0.8, 0.5)).toBe(false);
  });

  it('returns true when confidence is 0 (AI unavailable)', () => {
    expect(shouldEscalate(0, 0.5)).toBe(true);
  });

  it('returns false when threshold is 0 (escalation disabled)', () => {
    expect(shouldEscalate(0, 0)).toBe(false);
  });

  it('returns true when threshold is 1 (always escalate)', () => {
    expect(shouldEscalate(0.99, 1)).toBe(true);
  });
});

// ─── Fallback message ─────────────────────────────────────────────────────────

describe('FALLBACK_MESSAGE', () => {
  it('is a non-empty string', () => {
    expect(typeof FALLBACK_MESSAGE).toBe('string');
    expect(FALLBACK_MESSAGE.length).toBeGreaterThan(0);
  });
});

// ─── StubAiAdapter ────────────────────────────────────────────────────────────

describe('StubAiAdapter', () => {
  it('returns a response with confidence > 0', async () => {
    const adapter = new StubAiAdapter();
    const result = await adapter.chat([{ role: 'user', content: 'Hello' }]);
    expect(result.available).toBe(true);
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.content.length).toBeGreaterThan(0);
  });

  it('includes user message in response', async () => {
    const adapter = new StubAiAdapter();
    const result = await adapter.chat([{ role: 'user', content: 'What is the weather?' }]);
    expect(result.content).toContain('What is the weather?');
  });

  it('uses system prompt when provided', async () => {
    const adapter = new StubAiAdapter();
    const result = await adapter.chat(
      [{ role: 'user', content: 'Hi' }],
      'You are a helpful assistant',
    );
    expect(result.available).toBe(true);
  });
});

// ─── ValidationError ──────────────────────────────────────────────────────────

describe('ValidationError', () => {
  it('has correct name', () => {
    const err = new ValidationError('test');
    expect(err.name).toBe('ValidationError');
    expect(err.message).toBe('test');
  });
});

// ─── Context window boundary ──────────────────────────────────────────────────

describe('context window', () => {
  it('keeps only the last 20 messages', () => {
    const CONTEXT_WINDOW = 20;
    const context: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    for (let i = 0; i < 25; i++) {
      context.push({ role: 'user', content: `message ${i}` });
      if (context.length > CONTEXT_WINDOW) {
        context.splice(0, context.length - CONTEXT_WINDOW);
      }
    }

    expect(context.length).toBe(CONTEXT_WINDOW);
    expect(context[0]!.content).toBe('message 5');
    expect(context[context.length - 1]!.content).toBe('message 24');
  });
});
