import { describe, it, expect } from 'vitest';
import { computeLeadScore, type BehavioralSignals } from './scorer.js';

const noSignals: BehavioralSignals = {
  emailOpens: 0,
  chatbotSessions: 0,
  completedCalls: 0,
  failedCalls: 0,
  campaignClicks: 0,
  lifecycleStage: null,
};

describe('computeLeadScore', () => {
  // ─── Insufficient data guard ────────────────────────────────────────────────

  it('returns score=50 with low confidence when no signals', () => {
    const result = computeLeadScore(noSignals);
    expect(result.score).toBe(50);
    expect(result.confidence).toBe('low');
  });

  it('returns score=50 with low confidence when fewer than 3 signal types', () => {
    const result = computeLeadScore({ ...noSignals, emailOpens: 5, chatbotSessions: 2 });
    expect(result.score).toBe(50);
    expect(result.confidence).toBe('low');
  });

  it('returns high confidence when 3 or more signal types present', () => {
    const result = computeLeadScore({
      ...noSignals,
      emailOpens: 2,
      chatbotSessions: 1,
      completedCalls: 1,
    });
    expect(result.confidence).toBe('high');
  });

  // ─── Score bounds ───────────────────────────────────────────────────────────

  it('score is always >= 0', () => {
    const result = computeLeadScore({
      emailOpens: 1,
      chatbotSessions: 1,
      completedCalls: 0,
      failedCalls: 100,
      campaignClicks: 1,
      lifecycleStage: 'churned',
    });
    expect(result.score).toBeGreaterThanOrEqual(0);
  });

  it('score is always <= 100', () => {
    const result = computeLeadScore({
      emailOpens: 1000,
      chatbotSessions: 1000,
      completedCalls: 1000,
      failedCalls: 0,
      campaignClicks: 1000,
      lifecycleStage: 'customer',
    });
    expect(result.score).toBeLessThanOrEqual(100);
  });

  // ─── Email opens cap ────────────────────────────────────────────────────────

  it('caps email open points at 20', () => {
    // 5 opens = 25 pts raw, but capped at 20
    const result = computeLeadScore({
      ...noSignals,
      emailOpens: 5,
      chatbotSessions: 1,
      completedCalls: 1,
    });
    const emailFactor = result.factors.find((f) => f.name === 'email_opens');
    if (emailFactor) {
      expect(emailFactor.points).toBeLessThanOrEqual(20);
    }
  });

  it('gives +5 per email open up to the cap', () => {
    const result = computeLeadScore({
      ...noSignals,
      emailOpens: 2,
      chatbotSessions: 1,
      completedCalls: 1,
    });
    const emailFactor = result.factors.find((f) => f.name === 'email_opens');
    expect(emailFactor?.points).toBe(10);
  });

  // ─── Chatbot sessions cap ───────────────────────────────────────────────────

  it('caps chatbot session points at 30', () => {
    const result = computeLeadScore({
      ...noSignals,
      emailOpens: 1,
      chatbotSessions: 10,
      completedCalls: 1,
    });
    const chatFactor = result.factors.find((f) => f.name === 'chatbot_interactions');
    if (chatFactor) {
      expect(chatFactor.points).toBeLessThanOrEqual(30);
    }
  });

  // ─── Campaign clicks cap ────────────────────────────────────────────────────

  it('caps campaign click points at 24', () => {
    const result = computeLeadScore({
      ...noSignals,
      emailOpens: 1,
      chatbotSessions: 1,
      campaignClicks: 10,
      completedCalls: 1,
    });
    const clickFactor = result.factors.find((f) => f.name === 'campaign_clicks');
    if (clickFactor) {
      expect(clickFactor.points).toBeLessThanOrEqual(24);
    }
  });

  // ─── Call outcomes ──────────────────────────────────────────────────────────

  it('adds +15 per completed call', () => {
    const result = computeLeadScore({
      ...noSignals,
      emailOpens: 1,
      chatbotSessions: 1,
      completedCalls: 2,
    });
    const callFactor = result.factors.find((f) => f.name === 'completed_calls');
    expect(callFactor?.points).toBe(30);
  });

  it('subtracts 5 per failed call', () => {
    const result = computeLeadScore({
      ...noSignals,
      emailOpens: 1,
      chatbotSessions: 1,
      completedCalls: 1,
      failedCalls: 3,
    });
    const failFactor = result.factors.find((f) => f.name === 'failed_calls');
    expect(failFactor?.points).toBe(-15);
  });

  // ─── Lifecycle stage ────────────────────────────────────────────────────────

  it('adds +10 for lead stage', () => {
    const result = computeLeadScore({
      ...noSignals,
      emailOpens: 1,
      chatbotSessions: 1,
      completedCalls: 1,
      lifecycleStage: 'lead',
    });
    const stageFactor = result.factors.find((f) => f.name === 'lifecycle_stage');
    expect(stageFactor?.points).toBe(10);
  });

  it('adds +20 for prospect stage', () => {
    const result = computeLeadScore({
      ...noSignals,
      emailOpens: 1,
      chatbotSessions: 1,
      completedCalls: 1,
      lifecycleStage: 'prospect',
    });
    const stageFactor = result.factors.find((f) => f.name === 'lifecycle_stage');
    expect(stageFactor?.points).toBe(20);
  });

  it('adds +30 for customer stage', () => {
    const result = computeLeadScore({
      ...noSignals,
      emailOpens: 1,
      chatbotSessions: 1,
      completedCalls: 1,
      lifecycleStage: 'customer',
    });
    const stageFactor = result.factors.find((f) => f.name === 'lifecycle_stage');
    expect(stageFactor?.points).toBe(30);
  });

  it('subtracts 10 for churned stage', () => {
    const result = computeLeadScore({
      ...noSignals,
      emailOpens: 1,
      chatbotSessions: 1,
      completedCalls: 1,
      lifecycleStage: 'churned',
    });
    const stageFactor = result.factors.find((f) => f.name === 'lifecycle_stage');
    expect(stageFactor?.points).toBe(-10);
  });

  // ─── Top-3 factors ──────────────────────────────────────────────────────────

  it('returns at most 3 factors', () => {
    const result = computeLeadScore({
      emailOpens: 2,
      chatbotSessions: 2,
      completedCalls: 2,
      failedCalls: 1,
      campaignClicks: 2,
      lifecycleStage: 'customer',
    });
    expect(result.factors.length).toBeLessThanOrEqual(3);
  });

  it('returns top factors by absolute contribution', () => {
    // completedCalls: 2 * 15 = 30, customer: 30, chatbot: 2*10=20, clicks: 2*8=16, email: 2*5=10
    const result = computeLeadScore({
      emailOpens: 2,
      chatbotSessions: 2,
      completedCalls: 2,
      failedCalls: 0,
      campaignClicks: 2,
      lifecycleStage: 'customer',
    });
    // Top 3 should be completed_calls(30), lifecycle_stage(30), chatbot_interactions(20)
    const names = result.factors.map((f) => f.name);
    expect(names).toContain('completed_calls');
    expect(names).toContain('lifecycle_stage');
  });

  // ─── Score is an integer ────────────────────────────────────────────────────

  it('score is always an integer', () => {
    const result = computeLeadScore({
      emailOpens: 3,
      chatbotSessions: 2,
      completedCalls: 1,
      failedCalls: 0,
      campaignClicks: 1,
      lifecycleStage: 'prospect',
    });
    expect(Number.isInteger(result.score)).toBe(true);
  });
});
