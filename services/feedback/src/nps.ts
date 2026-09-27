/**
 * NPS (Net Promoter Score) calculation utilities.
 *
 * Promoters:  score 9–10
 * Passives:   score 7–8
 * Detractors: score 1–6
 *
 * NPS = (% promoters) − (% detractors)  ∈ [−100, 100]
 */

export interface NpsBreakdown {
  nps: number;
  promoters: number;
  passives: number;
  detractors: number;
  total: number;
  promoter_pct: number;
  passive_pct: number;
  detractor_pct: number;
}

/**
 * Extract the NPS score from a response's answers object.
 * Looks for a numeric field named "nps", "score", or "rating".
 */
export function extractNpsScore(answers: Record<string, unknown>): number | null {
  for (const key of ['nps', 'score', 'rating']) {
    const val = answers[key];
    if (typeof val === 'number' && val >= 0 && val <= 10) return val;
    if (typeof val === 'string') {
      const n = parseFloat(val);
      if (!isNaN(n) && n >= 0 && n <= 10) return n;
    }
  }
  return null;
}

/**
 * Compute NPS from an array of numeric scores (0–10).
 */
export function computeNps(scores: number[]): NpsBreakdown {
  const total = scores.length;

  if (total === 0) {
    return { nps: 0, promoters: 0, passives: 0, detractors: 0, total: 0, promoter_pct: 0, passive_pct: 0, detractor_pct: 0 };
  }

  let promoters = 0;
  let passives = 0;
  let detractors = 0;

  for (const score of scores) {
    if (score >= 9) promoters++;
    else if (score >= 7) passives++;
    else detractors++;
  }

  const promoter_pct = (promoters / total) * 100;
  const passive_pct = (passives / total) * 100;
  const detractor_pct = (detractors / total) * 100;
  const nps = Math.round(promoter_pct - detractor_pct);

  return { nps, promoters, passives, detractors, total, promoter_pct, passive_pct, detractor_pct };
}
