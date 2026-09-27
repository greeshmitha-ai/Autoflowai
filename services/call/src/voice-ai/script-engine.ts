/**
 * Voice AI Script Engine
 *
 * Executes a configurable call script with branching logic.
 * Script format:
 *   { steps: [{ id, prompt, branches: [{ keyword, next_step_id }] }] }
 *
 * The engine tracks the current step and advances based on keyword matching
 * in the customer's utterance.
 */

export interface ScriptBranch {
  /** Keyword (case-insensitive) that triggers this branch */
  keyword: string;
  /** ID of the next step to transition to, or null to end the call */
  next_step_id: string | null;
}

export interface ScriptStep {
  id: string;
  /** TTS prompt to speak to the customer */
  prompt: string;
  /** Ordered list of keyword branches; first match wins */
  branches: ScriptBranch[];
}

export interface CallScript {
  steps: ScriptStep[];
}

export interface ScriptState {
  current_step_id: string;
  completed: boolean;
}

export class ScriptEngine {
  private readonly stepMap: Map<string, ScriptStep>;

  constructor(private readonly script: CallScript) {
    this.stepMap = new Map(script.steps.map((s) => [s.id, s]));
    if (script.steps.length === 0) {
      throw new Error('Script must have at least one step');
    }
  }

  /** Return the initial state (first step) */
  initialState(): ScriptState {
    const firstStep = this.script.steps[0];
    if (!firstStep) throw new Error('Script has no steps');
    return { current_step_id: firstStep.id, completed: false };
  }

  /** Get the current step for a given state */
  currentStep(state: ScriptState): ScriptStep | null {
    if (state.completed) return null;
    return this.stepMap.get(state.current_step_id) ?? null;
  }

  /**
   * Advance the state based on a customer utterance.
   * Matches the first branch whose keyword appears in the utterance (case-insensitive).
   * If no branch matches, the state remains on the current step.
   *
   * Returns the new state and whether a branch was matched.
   */
  advance(
    state: ScriptState,
    utterance: string,
  ): { state: ScriptState; matched: boolean; matchedKeyword: string | null } {
    if (state.completed) {
      return { state, matched: false, matchedKeyword: null };
    }

    const step = this.stepMap.get(state.current_step_id);
    if (!step) {
      return { state: { ...state, completed: true }, matched: false, matchedKeyword: null };
    }

    const lower = utterance.toLowerCase();

    for (const branch of step.branches) {
      if (lower.includes(branch.keyword.toLowerCase())) {
        if (branch.next_step_id === null) {
          // null next_step_id means end of script
          return {
            state: { current_step_id: state.current_step_id, completed: true },
            matched: true,
            matchedKeyword: branch.keyword,
          };
        }

        if (!this.stepMap.has(branch.next_step_id)) {
          // Unknown step — treat as end
          return {
            state: { current_step_id: state.current_step_id, completed: true },
            matched: true,
            matchedKeyword: branch.keyword,
          };
        }

        return {
          state: { current_step_id: branch.next_step_id, completed: false },
          matched: true,
          matchedKeyword: branch.keyword,
        };
      }
    }

    // No branch matched — stay on current step
    return { state, matched: false, matchedKeyword: null };
  }

  /**
   * Check whether the utterance contains a human-transfer request.
   * Keywords: "human", "agent", "person", "representative", "transfer"
   */
  static isHumanTransferRequest(utterance: string): boolean {
    const TRANSFER_KEYWORDS = ['human', 'agent', 'person', 'representative', 'transfer'];
    const lower = utterance.toLowerCase();
    return TRANSFER_KEYWORDS.some((kw) => lower.includes(kw));
  }
}
