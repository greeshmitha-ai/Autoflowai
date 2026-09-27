import { describe, it, expect } from 'vitest';
import { computeNps, extractNpsScore } from './nps.js';
import { analyseSentiment, extractOpenTextAnswers } from './sentiment.js';
import { generateCsv } from './export.js';
import type { SurveyResults } from './survey.service.js';

// ─── NPS calculation tests ────────────────────────────────────────────────────

describe('computeNps', () => {
  it('returns zero NPS for empty scores', () => {
    const result = computeNps([]);
    expect(result.nps).toBe(0);
    expect(result.total).toBe(0);
  });

  it('calculates NPS correctly: all promoters', () => {
    const result = computeNps([9, 10, 10, 9]);
    expect(result.promoters).toBe(4);
    expect(result.detractors).toBe(0);
    expect(result.nps).toBe(100);
  });

  it('calculates NPS correctly: all detractors', () => {
    const result = computeNps([1, 2, 3, 4, 5, 6]);
    expect(result.detractors).toBe(6);
    expect(result.promoters).toBe(0);
    expect(result.nps).toBe(-100);
  });

  it('calculates NPS correctly: mixed scores', () => {
    // 2 promoters (9,10), 1 passive (7), 2 detractors (3,5)
    const result = computeNps([9, 10, 7, 3, 5]);
    expect(result.promoters).toBe(2);
    expect(result.passives).toBe(1);
    expect(result.detractors).toBe(2);
    // promoter_pct = 40, detractor_pct = 40 → NPS = 0
    expect(result.nps).toBe(0);
  });

  it('NPS is always in range [-100, 100]', () => {
    const scores = [1, 5, 6, 7, 8, 9, 10, 3, 2, 10];
    const result = computeNps(scores);
    expect(result.nps).toBeGreaterThanOrEqual(-100);
    expect(result.nps).toBeLessThanOrEqual(100);
  });

  it('passives (7-8) do not affect NPS', () => {
    // 1 promoter, 1 detractor, 8 passives → NPS = 0
    const result = computeNps([10, 1, 7, 7, 7, 7, 8, 8, 8, 8]);
    expect(result.nps).toBe(0);
  });
});

describe('extractNpsScore', () => {
  it('extracts score from "nps" key', () => {
    expect(extractNpsScore({ nps: 9 })).toBe(9);
  });

  it('extracts score from "score" key', () => {
    expect(extractNpsScore({ score: 7 })).toBe(7);
  });

  it('extracts score from "rating" key', () => {
    expect(extractNpsScore({ rating: '10' })).toBe(10);
  });

  it('returns null when no NPS field present', () => {
    expect(extractNpsScore({ comment: 'great' })).toBeNull();
  });

  it('returns null for out-of-range values', () => {
    expect(extractNpsScore({ nps: 11 })).toBeNull();
    expect(extractNpsScore({ nps: -1 })).toBeNull();
  });
});

// ─── Sentiment analysis tests ─────────────────────────────────────────────────

describe('analyseSentiment', () => {
  it('returns neutral for empty text', async () => {
    expect(await analyseSentiment('')).toBe('neutral');
  });

  it('detects positive sentiment', async () => {
    expect(await analyseSentiment('This is great and amazing!')).toBe('positive');
  });

  it('detects negative sentiment', async () => {
    expect(await analyseSentiment('This is terrible and awful')).toBe('negative');
  });

  it('returns neutral for ambiguous text', async () => {
    expect(await analyseSentiment('The product exists')).toBe('neutral');
  });
});

describe('extractOpenTextAnswers', () => {
  it('extracts string values from answers', () => {
    const text = extractOpenTextAnswers({ q1: 'Great service', q2: 10, q3: 'Would recommend' });
    expect(text).toContain('Great service');
    expect(text).toContain('Would recommend');
  });

  it('ignores non-string values', () => {
    const text = extractOpenTextAnswers({ score: 9, flag: true });
    expect(text.trim()).toBe('');
  });
});

// ─── CSV export tests ─────────────────────────────────────────────────────────

describe('generateCsv', () => {
  const mockResults: SurveyResults = {
    survey_id: 'survey-1',
    total_responses: 2,
    nps: {
      nps: 50,
      promoters: 1,
      passives: 0,
      detractors: 0,
      total: 2,
      promoter_pct: 50,
      passive_pct: 0,
      detractor_pct: 0,
    },
    sentiment_breakdown: { positive: 1, neutral: 1, negative: 0 },
    responses: [
      {
        response_id: 'r1',
        survey_id: 'survey-1',
        tenant_id: 'tenant-1',
        contact_id: null,
        answers: { nps: 10 },
        sentiment: 'positive',
        submitted_at: new Date('2024-01-01T00:00:00Z'),
      },
      {
        response_id: 'r2',
        survey_id: 'survey-1',
        tenant_id: 'tenant-1',
        contact_id: 'contact-1',
        answers: { nps: 5 },
        sentiment: 'neutral',
        submitted_at: new Date('2024-01-02T00:00:00Z'),
      },
    ],
  };

  it('includes CSV header row', () => {
    const csv = generateCsv(mockResults);
    expect(csv).toContain('response_id,submitted_at,contact_id,sentiment,answers');
  });

  it('includes all response rows', () => {
    const csv = generateCsv(mockResults);
    expect(csv).toContain('r1');
    expect(csv).toContain('r2');
  });

  it('includes NPS summary', () => {
    const csv = generateCsv(mockResults);
    expect(csv).toContain('NPS Score,50');
    expect(csv).toContain('Total Responses,2');
  });
});
