/**
 * Lead Scorer — computes a 0-100 score from behavioral signals.
 *
 * Scoring rules:
 *   email opens:          +5 per open, max 20
 *   chatbot interactions: +10 per session, max 30
 *   call outcomes:        +15 for completed call, -5 for failed call
 *   campaign clicks:      +8 per click, max 24
 *   lifecycle stage:      lead=10, prospect=20, customer=30, churned=-10
 *
 * Insufficient data (<3 signals) → score=50, confidence=low
 */

import type { ScoreFactor } from '@platform/db';

export interface BehavioralSignals {
  emailOpens: number;
  chatbotSessions: number;
  completedCalls: number;
  failedCalls: number;
  campaignClicks: number;
  lifecycleStage: string | null | undefined;
}

export interface ScoreResult {
  score: number;
  confidence: 'high' | 'low';
  factors: ScoreFactor[];
  signalCount: number;
}

const LIFECYCLE_POINTS: Record<string, number> = {
  lead: 10,
  prospect: 20,
  customer: 30,
  churned: -10,
};

export function computeLeadScore(signals: BehavioralSignals): ScoreResult {
  const rawFactors: ScoreFactor[] = [];

  // Email opens: +5 each, max 20
  if (signals.emailOpens > 0) {
    const points = Math.min(signals.emailOpens * 5, 20);
    rawFactors.push({
      name: 'email_opens',
      points,
      description: `${signals.emailOpens} email open(s) (+${points} pts)`,
    });
  }

  // Chatbot interactions: +10 per session, max 30
  if (signals.chatbotSessions > 0) {
    const points = Math.min(signals.chatbotSessions * 10, 30);
    rawFactors.push({
      name: 'chatbot_interactions',
      points,
      description: `${signals.chatbotSessions} chatbot session(s) (+${points} pts)`,
    });
  }

  // Call outcomes: +15 completed, -5 failed
  if (signals.completedCalls > 0) {
    const points = signals.completedCalls * 15;
    rawFactors.push({
      name: 'completed_calls',
      points,
      description: `${signals.completedCalls} completed call(s) (+${points} pts)`,
    });
  }
  if (signals.failedCalls > 0) {
    const points = -(signals.failedCalls * 5);
    rawFactors.push({
      name: 'failed_calls',
      points,
      description: `${signals.failedCalls} failed call(s) (${points} pts)`,
    });
  }

  // Campaign clicks: +8 each, max 24
  if (signals.campaignClicks > 0) {
    const points = Math.min(signals.campaignClicks * 8, 24);
    rawFactors.push({
      name: 'campaign_clicks',
      points,
      description: `${signals.campaignClicks} campaign click(s) (+${points} pts)`,
    });
  }

  // Lifecycle stage
  const stage = (signals.lifecycleStage ?? '').toLowerCase();
  if (stage && stage in LIFECYCLE_POINTS) {
    const points = LIFECYCLE_POINTS[stage]!;
    rawFactors.push({
      name: 'lifecycle_stage',
      points,
      description: `Lifecycle stage: ${stage} (${points > 0 ? '+' : ''}${points} pts)`,
    });
  }

  // Count distinct signal types (not lifecycle stage)
  const signalCount = [
    signals.emailOpens,
    signals.chatbotSessions,
    signals.completedCalls + signals.failedCalls,
    signals.campaignClicks,
  ].filter((v) => v > 0).length;

  // Insufficient data guard
  if (signalCount < 3) {
    return {
      score: 50,
      confidence: 'low',
      factors: rawFactors.slice(0, 3),
      signalCount,
    };
  }

  // Sum all factor points
  const total = rawFactors.reduce((sum, f) => sum + f.points, 0);

  // Clamp to [0, 100]
  const score = Math.max(0, Math.min(100, total));

  // Top-3 factors by absolute contribution
  const top3 = [...rawFactors]
    .sort((a, b) => Math.abs(b.points) - Math.abs(a.points))
    .slice(0, 3);

  return {
    score,
    confidence: 'high',
    factors: top3,
    signalCount,
  };
}
