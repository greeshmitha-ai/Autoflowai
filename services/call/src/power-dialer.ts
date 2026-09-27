/**
 * Power Dialer — auto-dials the next contact in a queue when the previous call ends.
 *
 * A session is stored in Redis with the queue of contact IDs and current position.
 * When a call completes, the dialer advances to the next contact automatically.
 */

import { randomUUID } from 'crypto';
import { getDb, contacts } from '@platform/db';
import { eq, and, inArray } from 'drizzle-orm';
import { createCall, updateCall } from './call.service.js';
import type { TwilioClient } from './twilio.client.js';
import { buildOutboundTwiml } from './twilio.client.js';
import type { CallConfig } from './config.js';
import type { CallScript } from './voice-ai/script-engine.js';
import { startVoiceAiCall } from './voice-ai/voice-ai.service.js';

export interface DialerSession {
  session_id: string;
  tenant_id: string;
  contact_ids: string[];
  current_index: number;
  status: 'running' | 'completed' | 'stopped';
  current_call_id: string | null;
  /** When true, each call uses Voice AI TwiML instead of standard outbound TwiML */
  use_voice_ai: boolean;
  /** Voice AI script (required when use_voice_ai=true) */
  voice_ai_script?: CallScript;
  /** Operator number for human transfer (used when use_voice_ai=true) */
  voice_ai_operator_number?: string;
}

// In-memory session store (replace with Redis in production)
const sessions = new Map<string, DialerSession>();

export function getSession(sessionId: string): DialerSession | undefined {
  return sessions.get(sessionId);
}

export function setSession(session: DialerSession): void {
  sessions.set(session.session_id, session);
}

/**
 * Start a power dialer session for the given contact IDs.
 * Immediately dials the first contact.
 */
export async function startPowerDialer(
  tenantId: string,
  contactIds: string[],
  twilioClient: TwilioClient,
  config: CallConfig,
): Promise<DialerSession> {
  if (contactIds.length === 0) {
    throw new Error('contactIds must not be empty');
  }

  const sessionId = randomUUID();
  const session: DialerSession = {
    session_id: sessionId,
    tenant_id: tenantId,
    contact_ids: contactIds,
    current_index: 0,
    status: 'running',
    current_call_id: null,
    use_voice_ai: false,
  };

  setSession(session);
  await dialNext(session, twilioClient, config);
  return session;
}

/**
 * Start a power dialer session with Voice AI enabled.
 * Each call in the queue uses Voice AI TwiML instead of standard outbound TwiML.
 */
export async function startPowerDialerWithVoiceAi(
  tenantId: string,
  contactIds: string[],
  script: CallScript,
  operatorNumber: string,
  twilioClient: TwilioClient,
  config: CallConfig,
): Promise<DialerSession> {
  if (contactIds.length === 0) {
    throw new Error('contactIds must not be empty');
  }

  const sessionId = randomUUID();
  const session: DialerSession = {
    session_id: sessionId,
    tenant_id: tenantId,
    contact_ids: contactIds,
    current_index: 0,
    status: 'running',
    current_call_id: null,
    use_voice_ai: true,
    voice_ai_script: script,
    voice_ai_operator_number: operatorNumber,
  };

  setSession(session);
  await dialNext(session, twilioClient, config);
  return session;
}

/**
 * Dial the next contact in the session queue.
 * Called when the previous call ends.
 */
export async function dialNext(
  session: DialerSession,
  twilioClient: TwilioClient,
  config: CallConfig,
): Promise<void> {
  if (session.current_index >= session.contact_ids.length) {
    session.status = 'completed';
    setSession(session);
    console.log(`[power-dialer] Session ${session.session_id} completed all contacts`);
    return;
  }

  const contactId = session.contact_ids[session.current_index];
  if (!contactId) {
    session.status = 'completed';
    setSession(session);
    return;
  }

  // Look up contact phone
  const db = getDb();
  const [contact] = await db
    .select({ phone: contacts.phone })
    .from(contacts)
    .where(and(eq(contacts.contact_id, contactId), eq(contacts.tenant_id, session.tenant_id)));

  if (!contact?.phone) {
    console.warn(`[power-dialer] Contact ${contactId} has no phone number, skipping`);
    session.current_index++;
    setSession(session);
    await dialNext(session, twilioClient, config);
    return;
  }

  // Voice AI mode — delegate to Voice AI service
  if (session.use_voice_ai && session.voice_ai_script) {
    try {
      const result = await startVoiceAiCall({
        tenantId: session.tenant_id,
        to: contact.phone,
        contactId,
        script: session.voice_ai_script,
        operatorNumber: session.voice_ai_operator_number ?? '+10000000000',
        twilioClient,
        config,
      });
      session.current_call_id = result.call_id;
      setSession(session);
      console.log(`[power-dialer] Voice AI dialing contact ${contactId} (call ${result.call_id})`);
    } catch (err) {
      console.error(`[power-dialer] Voice AI failed to dial contact ${contactId}:`, err);
      session.current_index++;
      setSession(session);
      await dialNext(session, twilioClient, config);
    }
    return;
  }

  // Standard mode — create call record
  const call = await createCall(session.tenant_id, {
    contact_id: contactId,
    direction: 'outbound',
    status: 'initiated',
    is_voice_ai: false,
  });

  session.current_call_id = call.call_id;
  setSession(session);

  const twimlUrl = `${config.webhookBaseUrl}/calls/${call.call_id}/twiml`;
  const statusCallbackUrl = `${config.webhookBaseUrl}/calls/${call.call_id}/status`;

  try {
    await twilioClient.initiateOutboundCall({
      to: contact.phone,
      from: config.twilioPhoneNumber,
      twimlUrl,
      statusCallbackUrl,
    });

    await updateCall(session.tenant_id, call.call_id, { status: 'connected' });
    console.log(`[power-dialer] Dialing contact ${contactId} (call ${call.call_id})`);
  } catch (err) {
    console.error(`[power-dialer] Failed to dial contact ${contactId}:`, err);
    await updateCall(session.tenant_id, call.call_id, { status: 'failed' });
    session.current_index++;
    setSession(session);
    await dialNext(session, twilioClient, config);
  }
}

/**
 * Advance the dialer to the next contact after a call ends.
 * Called from the call status webhook.
 */
export async function onCallCompleted(
  sessionId: string,
  twilioClient: TwilioClient,
  config: CallConfig,
): Promise<void> {
  const session = sessions.get(sessionId);
  if (!session || session.status !== 'running') return;

  session.current_index++;
  setSession(session);

  await dialNext(session, twilioClient, config);
}

/**
 * Fetch contact phone numbers for a list of contact IDs within a tenant.
 */
export async function getContactPhones(
  tenantId: string,
  contactIds: string[],
): Promise<Array<{ contact_id: string; phone: string | null }>> {
  const db = getDb();
  return db
    .select({ contact_id: contacts.contact_id, phone: contacts.phone })
    .from(contacts)
    .where(and(eq(contacts.tenant_id, tenantId), inArray(contacts.contact_id, contactIds)));
}
