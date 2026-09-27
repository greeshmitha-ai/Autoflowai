/**
 * Voice AI Service — orchestrates outbound Voice AI calls.
 *
 * Responsibilities:
 *  - Maintain per-call script state (in-memory; swap for Redis in production)
 *  - Handle STT gather callbacks and advance the script
 *  - Detect human-transfer requests and initiate <Dial>
 *  - Handle AMD callbacks for voicemail detection
 *  - Classify call outcomes and persist to DB
 *  - Integrate with the existing transcript worker for post-call processing
 */

import { randomUUID } from 'crypto';
import { updateCall, createCall } from '../call.service.js';
import type { TwilioClient } from '../twilio.client.js';
import type { CallConfig } from '../config.js';
import { ScriptEngine } from './script-engine.js';
import type { CallScript, ScriptState } from './script-engine.js';
import {
  buildVoiceAiOpeningTwiml,
  buildVoiceAiStepTwiml,
  buildHumanTransferTwiml,
  buildVoicemailMessageTwiml,
  buildVoiceAiEndTwiml,
  buildVoiceAiOutboundWithAmd,
} from './twiml-builder.js';

// ── Outcome classification ────────────────────────────────────────────────────

export type VoiceAiOutcome =
  | 'answered_by_human'
  | 'answered_by_voicemail'
  | 'no_answer'
  | 'transferred_to_agent';

// ── Per-call session ──────────────────────────────────────────────────────────

export interface VoiceAiSession {
  call_id: string;
  tenant_id: string;
  script: CallScript;
  state: ScriptState;
  outcome: VoiceAiOutcome | null;
  /** Operator number to dial on human-transfer request */
  operator_number: string;
}

/** In-memory session store — replace with Redis in production */
const sessions = new Map<string, VoiceAiSession>();

export function getVoiceAiSession(callId: string): VoiceAiSession | undefined {
  return sessions.get(callId);
}

function setVoiceAiSession(session: VoiceAiSession): void {
  sessions.set(session.call_id, session);
}

// ── TTS/STT AI adapter stub ───────────────────────────────────────────────────

/**
 * AI adapter stub for TTS/STT.
 * In production, wire to Deepgram (STT), ElevenLabs or OpenAI TTS.
 *
 * For now, Twilio's built-in <Say> handles TTS and <Gather input="speech"> handles STT,
 * so this stub is a placeholder for custom AI model integration.
 */
export async function generateContextualReply(
  _utterance: string,
  _currentPrompt: string,
): Promise<string> {
  // Stub: return a generic acknowledgement within 2 seconds
  // In production: call OpenAI / Deepgram with the utterance + script context
  await new Promise((resolve) => setTimeout(resolve, 50)); // simulate <2s latency
  return "I'm sorry, I didn't quite catch that. Could you please repeat?";
}

// ── Initiate a Voice AI outbound call ─────────────────────────────────────────

export interface StartVoiceAiCallParams {
  tenantId: string;
  to: string;
  contactId: string | null;
  script: CallScript;
  operatorNumber: string;
  twilioClient: TwilioClient;
  config: CallConfig;
}

export async function startVoiceAiCall(params: StartVoiceAiCallParams): Promise<{ call_id: string }> {
  const { tenantId, to, contactId, script, operatorNumber, twilioClient, config } = params;

  const engine = new ScriptEngine(script);
  const initialState = engine.initialState();

  // Create call record with is_voice_ai=true
  const call = await createCall(tenantId, {
    contact_id: contactId,
    direction: 'outbound',
    status: 'initiated',
    is_voice_ai: true,
  });

  const session: VoiceAiSession = {
    call_id: call.call_id,
    tenant_id: tenantId,
    script,
    state: initialState,
    outcome: null,
    operator_number: operatorNumber,
  };
  setVoiceAiSession(session);

  const twimlUrl = `${config.webhookBaseUrl}/calls/${call.call_id}/voice-ai/twiml`;
  const statusCallbackUrl = `${config.webhookBaseUrl}/calls/${call.call_id}/status`;
  const amdCallbackUrl = `${config.webhookBaseUrl}/calls/${call.call_id}/voice-ai/amd`;

  // Build AMD params — passed as extra options to Twilio call creation
  const amdParams = buildVoiceAiOutboundWithAmd(twimlUrl, amdCallbackUrl);

  try {
    await twilioClient.initiateOutboundCall({
      to,
      from: config.twilioPhoneNumber,
      twimlUrl: (amdParams as { url: string }).url,
      statusCallbackUrl,
    });
    await updateCall(tenantId, call.call_id, { status: 'connected' });
  } catch (err) {
    await updateCall(tenantId, call.call_id, { status: 'failed' });
    sessions.delete(call.call_id);
    throw err;
  }

  return { call_id: call.call_id };
}

// ── Handle opening TwiML request ─────────────────────────────────────────────

export function handleVoiceAiTwiml(callId: string, webhookBaseUrl: string): string {
  const session = sessions.get(callId);
  if (!session) {
    return buildVoiceAiEndTwiml('An error occurred. Goodbye.');
  }

  const engine = new ScriptEngine(session.script);
  const step = engine.currentStep(session.state);
  if (!step) {
    return buildVoiceAiEndTwiml();
  }

  return buildVoiceAiOpeningTwiml(webhookBaseUrl, callId, step.prompt);
}

// ── Handle <Gather> STT callback ─────────────────────────────────────────────

export interface GatherResult {
  twiml: string;
  transferred: boolean;
  ended: boolean;
}

export async function handleGatherCallback(
  callId: string,
  utterance: string,
  webhookBaseUrl: string,
): Promise<GatherResult> {
  const session = sessions.get(callId);
  if (!session) {
    return {
      twiml: buildVoiceAiEndTwiml('Session not found. Goodbye.'),
      transferred: false,
      ended: true,
    };
  }

  // Check for human-transfer request first
  if (ScriptEngine.isHumanTransferRequest(utterance)) {
    session.outcome = 'transferred_to_agent';
    setVoiceAiSession(session);

    await updateCall(session.tenant_id, callId, {
      status: 'completed',
      ended_at: new Date(),
    }).catch(() => {/* ignore */});

    const fallbackUrl = `${webhookBaseUrl}/calls/${callId}/voice-ai/transfer-failed`;
    return {
      twiml: buildHumanTransferTwiml(session.operator_number, 30, fallbackUrl),
      transferred: true,
      ended: false,
    };
  }

  // Advance script state
  const engine = new ScriptEngine(session.script);
  const { state: newState, matched } = engine.advance(session.state, utterance);
  session.state = newState;
  setVoiceAiSession(session);

  if (newState.completed) {
    session.outcome = 'answered_by_human';
    setVoiceAiSession(session);

    await updateCall(session.tenant_id, callId, {
      status: 'completed',
      ended_at: new Date(),
    }).catch(() => {/* ignore */});

    return {
      twiml: buildVoiceAiEndTwiml(),
      transferred: false,
      ended: true,
    };
  }

  const nextStep = engine.currentStep(newState);
  if (!nextStep) {
    return {
      twiml: buildVoiceAiEndTwiml(),
      transferred: false,
      ended: true,
    };
  }

  // If no branch matched, generate a contextual fallback reply
  let prompt = nextStep.prompt;
  if (!matched) {
    prompt = await generateContextualReply(utterance, nextStep.prompt);
  }

  return {
    twiml: buildVoiceAiStepTwiml(webhookBaseUrl, callId, prompt),
    transferred: false,
    ended: false,
  };
}

// ── Handle AMD (Answering Machine Detection) callback ────────────────────────

export interface AmdResult {
  twiml: string;
  outcome: VoiceAiOutcome;
}

export async function handleAmdCallback(
  callId: string,
  answeredBy: string,
  voicemailMessage: string,
): Promise<AmdResult> {
  const session = sessions.get(callId);

  // AMD values: "human", "machine_start", "machine_end_beep", "machine_end_silence",
  //             "machine_end_other", "fax", "unknown"
  const isVoicemail = answeredBy.startsWith('machine') || answeredBy === 'fax';

  if (isVoicemail) {
    const outcome: VoiceAiOutcome = 'answered_by_voicemail';

    if (session) {
      session.outcome = outcome;
      setVoiceAiSession(session);
    }

    const tenantId = session?.tenant_id;
    if (tenantId) {
      await updateCall(tenantId, callId, {
        status: 'voicemail',
        ended_at: new Date(),
      }).catch(() => {/* ignore */});
    }

    return {
      twiml: buildVoicemailMessageTwiml(voicemailMessage),
      outcome,
    };
  }

  // Human answered — continue with normal Voice AI flow
  const outcome: VoiceAiOutcome = 'answered_by_human';
  if (session) {
    session.outcome = outcome;
    setVoiceAiSession(session);
  }

  return {
    twiml: '', // No TwiML needed — the original twimlUrl handles the call
    outcome,
  };
}

// ── Handle transfer failure fallback ─────────────────────────────────────────

export async function handleTransferFailed(callId: string): Promise<string> {
  const session = sessions.get(callId);
  if (session) {
    await updateCall(session.tenant_id, callId, {
      status: 'completed',
      ended_at: new Date(),
    }).catch(() => {/* ignore */});
  }
  return buildVoiceAiEndTwiml(
    'We were unable to connect you to an agent. Please call back during business hours. Goodbye.',
  );
}

// ── Classify no-answer outcome ────────────────────────────────────────────────

export async function handleNoAnswer(tenantId: string, callId: string): Promise<void> {
  const session = sessions.get(callId);
  if (session && !session.outcome) {
    session.outcome = 'no_answer';
    setVoiceAiSession(session);
  }
  await updateCall(tenantId, callId, {
    status: 'failed',
    ended_at: new Date(),
  }).catch(() => {/* ignore */});
}
