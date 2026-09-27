/**
 * Churn risk score calculation algorithm.
 *
 * Score is a float in [0, 1] where higher = more likely to churn.
 * Risk level: low < 0.4, medium 0.4–0.7, high > 0.7
 *
 * Factors:
 *  - Engagement frequency: days since last interaction (higher = more risk)
 *  - Sentiment trend: average sentiment from calls/surveys (negative = more risk)
 *  - Subscription activity: no activity in 30+ days = high risk contribution
 */

export interface ChurnSignals {
  /** Days since the contact's last recorded interaction (call, survey, campaign event) */
  daysSinceLastInteraction: number;
  /** Average sentiment score across calls/surveys: -1 (very negative) to +1 (very positive) */
  avgSentiment: number;
  /** Days since any activity (campaign open, call, survey response) */
  daysInactive: number;
  /** Total number of interactions available for this contact */
  totalInteractions: number;
}

export interface ChurnResult {
  score: number;
  risk_level: 'low' | 'medium' | 'high';
  factors: {
    engagement_frequency: number;
    sentiment_trend: number;
    subscription_activity: number;
  };
}

/**
 * Compute churn risk score from behavioral signals.
 * Returns score in [0, 1].
 */
export function computeChurnRisk(signals: ChurnSignals): ChurnResult {
  // ── Engagement frequency factor (0–0.4) ──────────────────────────────────
  // 0 days = 0 risk, 90+ days = max risk (0.4)
  const engagementFactor = Math.min(signals.daysSinceLastInteraction / 90, 1) * 0.4;

  // ── Sentiment trend factor (0–0.35) ──────────────────────────────────────
  // avgSentiment in [-1, 1]; map to [0, 0.35] where -1 → 0.35, +1 → 0
  const sentimentFactor = ((1 - signals.avgSentiment) / 2) * 0.35;

  // ── Subscription activity factor (0–0.25) ────────────────────────────────
  // No activity in 30+ days contributes up to 0.25
  const activityFactor = signals.daysInactive >= 30
    ? Math.min((signals.daysInactive - 30) / 60, 1) * 0.25
    : 0;

  const rawScore = engagementFactor + sentimentFactor + activityFactor;
  const score = Math.min(Math.max(rawScore, 0), 1);

  const risk_level: 'low' | 'medium' | 'high' =
    score > 0.7 ? 'high' : score >= 0.4 ? 'medium' : 'low';

  return {
    score,
    risk_level,
    factors: {
      engagement_frequency: engagementFactor,
      sentiment_trend: sentimentFactor,
      subscription_activity: activityFactor,
    },
  };
}
