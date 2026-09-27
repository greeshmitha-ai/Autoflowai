/**
 * Attribution Engine unit tests.
 * Tests: credit distribution logic for all three models.
 * Requirements: 24.1, 24.2, 24.3
 */
import { describe, it, expect } from 'vitest';
import { calculateCreditDistribution } from './attribution.service.js';
import type { Touchpoint } from '@platform/db';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTouchpoint(
  id: string,
  occurredAt: string,
  channel: Touchpoint['channel'] = 'email',
): Touchpoint {
  return {
    touchpoint_id: id,
    tenant_id: 'tenant-1',
    contact_id: 'contact-1',
    channel,
    campaign_id: null,
    event_type: 'campaign.opened',
    occurred_at: new Date(occurredAt),
  };
}

// ─── first_touch model ────────────────────────────────────────────────────────

describe('calculateCreditDistribution — first_touch', () => {
  it('assigns 100% credit to the earliest touchpoint', () => {
    const tps = [
      makeTouchpoint('tp-1', '2024-01-03T00:00:00Z'),
      makeTouchpoint('tp-2', '2024-01-01T00:00:00Z'), // earliest
      makeTouchpoint('tp-3', '2024-01-05T00:00:00Z'),
    ];

    const result = calculateCreditDistribution(tps, 'first_touch');

    const first = result.find((r) => r.touchpoint_id === 'tp-2');
    const others = result.filter((r) => r.touchpoint_id !== 'tp-2');

    expect(first?.credit).toBe(1.0);
    others.forEach((r) => expect(r.credit).toBe(0.0));
  });

  it('handles a single touchpoint', () => {
    const tps = [makeTouchpoint('tp-1', '2024-01-01T00:00:00Z')];
    const result = calculateCreditDistribution(tps, 'first_touch');
    expect(result).toHaveLength(1);
    expect(result[0]?.credit).toBe(1.0);
  });

  it('returns empty array for no touchpoints', () => {
    expect(calculateCreditDistribution([], 'first_touch')).toEqual([]);
  });
});

// ─── last_touch model ─────────────────────────────────────────────────────────

describe('calculateCreditDistribution — last_touch', () => {
  it('assigns 100% credit to the most recent touchpoint', () => {
    const tps = [
      makeTouchpoint('tp-1', '2024-01-01T00:00:00Z'),
      makeTouchpoint('tp-2', '2024-01-05T00:00:00Z'), // latest
      makeTouchpoint('tp-3', '2024-01-03T00:00:00Z'),
    ];

    const result = calculateCreditDistribution(tps, 'last_touch');

    const last = result.find((r) => r.touchpoint_id === 'tp-2');
    const others = result.filter((r) => r.touchpoint_id !== 'tp-2');

    expect(last?.credit).toBe(1.0);
    others.forEach((r) => expect(r.credit).toBe(0.0));
  });

  it('handles a single touchpoint', () => {
    const tps = [makeTouchpoint('tp-1', '2024-01-01T00:00:00Z')];
    const result = calculateCreditDistribution(tps, 'last_touch');
    expect(result[0]?.credit).toBe(1.0);
  });
});

// ─── linear model ─────────────────────────────────────────────────────────────

describe('calculateCreditDistribution — linear', () => {
  it('distributes credit equally across all touchpoints', () => {
    const tps = [
      makeTouchpoint('tp-1', '2024-01-01T00:00:00Z'),
      makeTouchpoint('tp-2', '2024-01-02T00:00:00Z'),
      makeTouchpoint('tp-3', '2024-01-03T00:00:00Z'),
      makeTouchpoint('tp-4', '2024-01-04T00:00:00Z'),
    ];

    const result = calculateCreditDistribution(tps, 'linear');

    // Total credit must sum to 1.0
    const total = result.reduce((sum, r) => sum + r.credit, 0);
    expect(Math.round(total * 10000) / 10000).toBe(1.0);

    // Each credit should be approximately 0.25
    result.forEach((r) => {
      expect(r.credit).toBeGreaterThan(0);
      expect(r.credit).toBeLessThanOrEqual(0.25 + 0.001);
    });
  });

  it('sums to exactly 1.0 for 3 touchpoints (handles rounding)', () => {
    const tps = [
      makeTouchpoint('tp-1', '2024-01-01T00:00:00Z'),
      makeTouchpoint('tp-2', '2024-01-02T00:00:00Z'),
      makeTouchpoint('tp-3', '2024-01-03T00:00:00Z'),
    ];

    const result = calculateCreditDistribution(tps, 'linear');
    const total = result.reduce((sum, r) => sum + r.credit, 0);
    expect(Math.round(total * 10000) / 10000).toBe(1.0);
  });

  it('handles a single touchpoint — assigns 100%', () => {
    const tps = [makeTouchpoint('tp-1', '2024-01-01T00:00:00Z')];
    const result = calculateCreditDistribution(tps, 'linear');
    expect(result[0]?.credit).toBe(1.0);
  });

  it('handles two touchpoints — each gets 50%', () => {
    const tps = [
      makeTouchpoint('tp-1', '2024-01-01T00:00:00Z'),
      makeTouchpoint('tp-2', '2024-01-02T00:00:00Z'),
    ];

    const result = calculateCreditDistribution(tps, 'linear');
    const total = result.reduce((sum, r) => sum + r.credit, 0);
    expect(Math.round(total * 10000) / 10000).toBe(1.0);
    result.forEach((r) => expect(r.credit).toBeCloseTo(0.5, 4));
  });
});

// ─── Cross-model invariants ───────────────────────────────────────────────────

describe('calculateCreditDistribution — invariants', () => {
  const models = ['first_touch', 'last_touch', 'linear'] as const;

  it('total credit always sums to 1.0 for any model with touchpoints', () => {
    const tps = [
      makeTouchpoint('tp-1', '2024-01-01T00:00:00Z', 'email'),
      makeTouchpoint('tp-2', '2024-01-02T00:00:00Z', 'call'),
      makeTouchpoint('tp-3', '2024-01-03T00:00:00Z', 'chatbot'),
      makeTouchpoint('tp-4', '2024-01-04T00:00:00Z', 'sms'),
      makeTouchpoint('tp-5', '2024-01-05T00:00:00Z', 'campaign'),
    ];

    for (const model of models) {
      const result = calculateCreditDistribution(tps, model);
      const total = result.reduce((sum, r) => sum + r.credit, 0);
      expect(Math.round(total * 10000) / 10000).toBe(1.0);
    }
  });

  it('all credit values are non-negative', () => {
    const tps = [
      makeTouchpoint('tp-1', '2024-01-01T00:00:00Z'),
      makeTouchpoint('tp-2', '2024-01-02T00:00:00Z'),
    ];

    for (const model of models) {
      const result = calculateCreditDistribution(tps, model);
      result.forEach((r) => expect(r.credit).toBeGreaterThanOrEqual(0));
    }
  });

  it('returns same number of entries as input touchpoints', () => {
    const tps = [
      makeTouchpoint('tp-1', '2024-01-01T00:00:00Z'),
      makeTouchpoint('tp-2', '2024-01-02T00:00:00Z'),
      makeTouchpoint('tp-3', '2024-01-03T00:00:00Z'),
    ];

    for (const model of models) {
      const result = calculateCreditDistribution(tps, model);
      expect(result).toHaveLength(tps.length);
    }
  });
});
