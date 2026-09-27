import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateForecast } from './crm.service.js';

// ─── Unit tests for forecast calculation ─────────────────────────────────────

describe('calculateForecast', () => {
  // Fixed reference date for deterministic tests
  const REF = new Date('2024-06-03T00:00:00.000Z'); // Monday

  it('returns empty buckets when no deals provided', () => {
    const result = calculateForecast([], REF);
    expect(result.weekly.length).toBeGreaterThan(0);
    expect(result.monthly.length).toBeGreaterThan(0);
    // All buckets should have zero weighted value
    for (const b of result.weekly) {
      expect(b.weighted_value).toBe(0);
      expect(b.deal_count).toBe(0);
    }
    for (const b of result.monthly) {
      expect(b.weighted_value).toBe(0);
      expect(b.deal_count).toBe(0);
    }
  });

  it('calculates weighted value as deal_value × win_probability', () => {
    const deals = [
      {
        value: '1000',
        win_probability: '0.5',
        expected_close_date: '2024-06-10',
      },
    ];

    const result = calculateForecast(deals, REF);

    // Find the week containing 2024-06-10
    const weekBucket = result.weekly.find((b) => b.label === '2024-W24');
    expect(weekBucket).toBeDefined();
    expect(weekBucket!.weighted_value).toBe(500); // 1000 × 0.5
    expect(weekBucket!.deal_count).toBe(1);

    // Find the month bucket for June 2024
    const monthBucket = result.monthly.find((b) => b.label === '2024-06');
    expect(monthBucket).toBeDefined();
    expect(monthBucket!.weighted_value).toBe(500);
    expect(monthBucket!.deal_count).toBe(1);
  });

  it('aggregates multiple deals in the same week', () => {
    const deals = [
      { value: '2000', win_probability: '0.4', expected_close_date: '2024-06-10' },
      { value: '1000', win_probability: '0.6', expected_close_date: '2024-06-12' },
    ];

    const result = calculateForecast(deals, REF);

    const weekBucket = result.weekly.find((b) => b.label === '2024-W24');
    expect(weekBucket).toBeDefined();
    // 2000×0.4 + 1000×0.6 = 800 + 600 = 1400
    expect(weekBucket!.weighted_value).toBe(1400);
    expect(weekBucket!.deal_count).toBe(2);
  });

  it('aggregates multiple deals in the same month across different weeks', () => {
    const deals = [
      { value: '5000', win_probability: '0.2', expected_close_date: '2024-06-05' },
      { value: '3000', win_probability: '0.8', expected_close_date: '2024-06-25' },
    ];

    const result = calculateForecast(deals, REF);

    const monthBucket = result.monthly.find((b) => b.label === '2024-06');
    expect(monthBucket).toBeDefined();
    // 5000×0.2 + 3000×0.8 = 1000 + 2400 = 3400
    expect(monthBucket!.weighted_value).toBe(3400);
    expect(monthBucket!.deal_count).toBe(2);
  });

  it('excludes deals with no expected_close_date', () => {
    const deals = [
      { value: '5000', win_probability: '0.5', expected_close_date: null },
    ];

    const result = calculateForecast(deals, REF);

    for (const b of result.weekly) {
      expect(b.deal_count).toBe(0);
    }
  });

  it('excludes deals closing outside the 90-day window', () => {
    const deals = [
      // 200 days in the future — outside window
      { value: '10000', win_probability: '0.9', expected_close_date: '2024-12-20' },
      // In the past
      { value: '10000', win_probability: '0.9', expected_close_date: '2024-01-01' },
    ];

    const result = calculateForecast(deals, REF);

    for (const b of result.weekly) {
      expect(b.deal_count).toBe(0);
    }
  });

  it('handles win_probability of 0 (lost-stage deals)', () => {
    const deals = [
      { value: '50000', win_probability: '0', expected_close_date: '2024-06-15' },
    ];

    const result = calculateForecast(deals, REF);

    const weekBucket = result.weekly.find((b) => b.deal_count > 0);
    expect(weekBucket).toBeDefined();
    expect(weekBucket!.weighted_value).toBe(0);
  });

  it('handles win_probability of 1 (closed-won stage)', () => {
    const deals = [
      { value: '7500', win_probability: '1', expected_close_date: '2024-06-20' },
    ];

    const result = calculateForecast(deals, REF);

    const weekBucket = result.weekly.find((b) => b.deal_count > 0);
    expect(weekBucket).toBeDefined();
    expect(weekBucket!.weighted_value).toBe(7500);
  });

  it('covers exactly 90 days in weekly buckets', () => {
    const result = calculateForecast([], REF);
    // 90 days spans at most 14 weeks (could be 13 or 14 depending on start day)
    expect(result.weekly.length).toBeGreaterThanOrEqual(13);
    expect(result.weekly.length).toBeLessThanOrEqual(14);
  });

  it('covers the correct months in monthly buckets', () => {
    const result = calculateForecast([], REF);
    // 90 days from June 3 spans June 3 → Sep 1: June, July, August, September
    const labels = result.monthly.map((b) => b.label);
    expect(labels).toContain('2024-06');
    expect(labels).toContain('2024-07');
    expect(labels).toContain('2024-08');
    // Should have at least 3 months
    expect(result.monthly.length).toBeGreaterThanOrEqual(3);
  });

  it('rounds weighted values to 2 decimal places', () => {
    const deals = [
      { value: '100', win_probability: '0.333', expected_close_date: '2024-06-10' },
    ];

    const result = calculateForecast(deals, REF);

    const weekBucket = result.weekly.find((b) => b.deal_count > 0);
    expect(weekBucket).toBeDefined();
    // 100 × 0.333 = 33.3 → rounded to 33.3
    expect(weekBucket!.weighted_value).toBe(33.3);
  });

  it('weekly buckets have correct start/end date format', () => {
    const result = calculateForecast([], REF);
    for (const b of result.weekly) {
      expect(b.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(b.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(b.start) <= new Date(b.end)).toBe(true);
    }
  });

  it('monthly buckets have correct start/end date format', () => {
    const result = calculateForecast([], REF);
    for (const b of result.monthly) {
      expect(b.start).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(b.end).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(b.start) <= new Date(b.end)).toBe(true);
    }
  });

  it('total weighted forecast equals sum of (value × probability) for all included deals', () => {
    const deals = [
      { value: '1000', win_probability: '0.5', expected_close_date: '2024-06-10' },
      { value: '2000', win_probability: '0.3', expected_close_date: '2024-07-15' },
      { value: '500',  win_probability: '0.8', expected_close_date: '2024-08-20' },
    ];

    const result = calculateForecast(deals, REF);

    const totalWeekly = result.weekly.reduce((sum, b) => sum + b.weighted_value, 0);
    const totalMonthly = result.monthly.reduce((sum, b) => sum + b.weighted_value, 0);

    const expected = 1000 * 0.5 + 2000 * 0.3 + 500 * 0.8; // 500 + 600 + 400 = 1500

    expect(Math.round(totalWeekly * 100) / 100).toBe(expected);
    expect(Math.round(totalMonthly * 100) / 100).toBe(expected);
  });
});
