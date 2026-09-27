/**
 * Unit tests for the Voice AI ScriptEngine branching logic.
 */

import { describe, it, expect } from 'vitest';
import { ScriptEngine } from './script-engine.js';
import type { CallScript } from './script-engine.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const simpleScript: CallScript = {
  steps: [
    {
      id: 'intro',
      prompt: 'Hello! Are you interested in our product?',
      branches: [
        { keyword: 'yes', next_step_id: 'pricing' },
        { keyword: 'no', next_step_id: null },
      ],
    },
    {
      id: 'pricing',
      prompt: 'Great! Our plan starts at $99/month. Would you like to schedule a demo?',
      branches: [
        { keyword: 'yes', next_step_id: 'schedule' },
        { keyword: 'no', next_step_id: null },
      ],
    },
    {
      id: 'schedule',
      prompt: 'Wonderful! I will send you a calendar invite. Have a great day!',
      branches: [
        { keyword: 'thanks', next_step_id: null },
      ],
    },
  ],
};

// ── Constructor ───────────────────────────────────────────────────────────────

describe('ScriptEngine constructor', () => {
  it('throws when script has no steps', () => {
    expect(() => new ScriptEngine({ steps: [] })).toThrow('Script must have at least one step');
  });

  it('creates engine for valid script', () => {
    expect(() => new ScriptEngine(simpleScript)).not.toThrow();
  });
});

// ── initialState ──────────────────────────────────────────────────────────────

describe('ScriptEngine.initialState()', () => {
  it('returns the first step id and completed=false', () => {
    const engine = new ScriptEngine(simpleScript);
    const state = engine.initialState();
    expect(state.current_step_id).toBe('intro');
    expect(state.completed).toBe(false);
  });
});

// ── currentStep ───────────────────────────────────────────────────────────────

describe('ScriptEngine.currentStep()', () => {
  it('returns the step matching current_step_id', () => {
    const engine = new ScriptEngine(simpleScript);
    const state = engine.initialState();
    const step = engine.currentStep(state);
    expect(step?.id).toBe('intro');
    expect(step?.prompt).toContain('interested');
  });

  it('returns null when state is completed', () => {
    const engine = new ScriptEngine(simpleScript);
    const step = engine.currentStep({ current_step_id: 'intro', completed: true });
    expect(step).toBeNull();
  });

  it('returns null for unknown step id', () => {
    const engine = new ScriptEngine(simpleScript);
    const step = engine.currentStep({ current_step_id: 'nonexistent', completed: false });
    expect(step).toBeNull();
  });
});

// ── advance — keyword matching ────────────────────────────────────────────────

describe('ScriptEngine.advance() — keyword matching', () => {
  it('advances to next step when keyword matches', () => {
    const engine = new ScriptEngine(simpleScript);
    const state = engine.initialState();
    const { state: next, matched, matchedKeyword } = engine.advance(state, 'Yes, I am interested');
    expect(matched).toBe(true);
    expect(matchedKeyword).toBe('yes');
    expect(next.current_step_id).toBe('pricing');
    expect(next.completed).toBe(false);
  });

  it('is case-insensitive', () => {
    const engine = new ScriptEngine(simpleScript);
    const state = engine.initialState();
    const { matched } = engine.advance(state, 'YES PLEASE');
    expect(matched).toBe(true);
  });

  it('matches keyword embedded in a sentence', () => {
    const engine = new ScriptEngine(simpleScript);
    const state = engine.initialState();
    const { matched, matchedKeyword } = engine.advance(state, 'I would say yes to that');
    expect(matched).toBe(true);
    expect(matchedKeyword).toBe('yes');
  });

  it('uses first matching branch (order matters)', () => {
    const script: CallScript = {
      steps: [
        {
          id: 'start',
          prompt: 'Pick one',
          branches: [
            { keyword: 'yes', next_step_id: 'a' },
            { keyword: 'yes', next_step_id: 'b' }, // duplicate — should never reach
          ],
        },
        { id: 'a', prompt: 'A', branches: [] },
        { id: 'b', prompt: 'B', branches: [] },
      ],
    };
    const engine = new ScriptEngine(script);
    const { state } = engine.advance(engine.initialState(), 'yes');
    expect(state.current_step_id).toBe('a');
  });
});

// ── advance — no match ────────────────────────────────────────────────────────

describe('ScriptEngine.advance() — no match', () => {
  it('stays on current step when no keyword matches', () => {
    const engine = new ScriptEngine(simpleScript);
    const state = engine.initialState();
    const { state: next, matched } = engine.advance(state, 'I am thinking about it');
    expect(matched).toBe(false);
    expect(next.current_step_id).toBe('intro');
    expect(next.completed).toBe(false);
  });

  it('returns matched=false and matchedKeyword=null on no match', () => {
    const engine = new ScriptEngine(simpleScript);
    const { matchedKeyword } = engine.advance(engine.initialState(), 'hmm');
    expect(matchedKeyword).toBeNull();
  });
});

// ── advance — null next_step_id (end of script) ───────────────────────────────

describe('ScriptEngine.advance() — end of script', () => {
  it('marks completed=true when branch has null next_step_id', () => {
    const engine = new ScriptEngine(simpleScript);
    const state = engine.initialState();
    const { state: next, matched } = engine.advance(state, 'No thank you');
    expect(matched).toBe(true);
    expect(next.completed).toBe(true);
  });

  it('stays completed once completed', () => {
    const engine = new ScriptEngine(simpleScript);
    const completedState = { current_step_id: 'intro', completed: true };
    const { state: next, matched } = engine.advance(completedState, 'yes');
    expect(matched).toBe(false);
    expect(next.completed).toBe(true);
  });
});

// ── advance — unknown next_step_id ────────────────────────────────────────────

describe('ScriptEngine.advance() — unknown next_step_id', () => {
  it('marks completed=true when branch points to unknown step', () => {
    const script: CallScript = {
      steps: [
        {
          id: 'start',
          prompt: 'Hello',
          branches: [{ keyword: 'go', next_step_id: 'does-not-exist' }],
        },
      ],
    };
    const engine = new ScriptEngine(script);
    const { state, matched } = engine.advance(engine.initialState(), 'go');
    expect(matched).toBe(true);
    expect(state.completed).toBe(true);
  });
});

// ── multi-step traversal ──────────────────────────────────────────────────────

describe('ScriptEngine multi-step traversal', () => {
  it('traverses intro → pricing → schedule', () => {
    const engine = new ScriptEngine(simpleScript);
    let state = engine.initialState();

    ({ state } = engine.advance(state, 'yes'));
    expect(state.current_step_id).toBe('pricing');

    ({ state } = engine.advance(state, 'yes, schedule a demo'));
    expect(state.current_step_id).toBe('schedule');

    ({ state } = engine.advance(state, 'thanks a lot'));
    expect(state.completed).toBe(true);
  });

  it('ends early on "no" at intro', () => {
    const engine = new ScriptEngine(simpleScript);
    let state = engine.initialState();
    ({ state } = engine.advance(state, 'no'));
    expect(state.completed).toBe(true);
  });
});

// ── isHumanTransferRequest ────────────────────────────────────────────────────

describe('ScriptEngine.isHumanTransferRequest()', () => {
  const transferPhrases = [
    'I want to speak to a human',
    'Can I talk to an agent please',
    'Connect me to a person',
    'I need a representative',
    'Please transfer me',
    'HUMAN',
    'get me an AGENT',
  ];

  for (const phrase of transferPhrases) {
    it(`detects transfer request: "${phrase}"`, () => {
      expect(ScriptEngine.isHumanTransferRequest(phrase)).toBe(true);
    });
  }

  const nonTransferPhrases = [
    'yes',
    'no thank you',
    'tell me more',
    'what is the price',
  ];

  for (const phrase of nonTransferPhrases) {
    it(`does not flag non-transfer phrase: "${phrase}"`, () => {
      expect(ScriptEngine.isHumanTransferRequest(phrase)).toBe(false);
    });
  }
});
