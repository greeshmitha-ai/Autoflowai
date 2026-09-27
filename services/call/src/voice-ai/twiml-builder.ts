/**
 * TwiML Builder for Voice AI calls.
 *
 * Generates TwiML responses for:
 *  - Initial disclosure + first script prompt (with <Gather> for STT)
 *  - Subsequent script steps
 *  - Human transfer via <Dial>
 *  - Voicemail detection (AMD) and voicemail message
 */

export const DISCLOSURE_MESSAGE =
  'This call is being handled by an AI assistant. You may say "agent" at any time to speak with a human representative.';

/**
 * Build the opening TwiML for a Voice AI outbound call.
 * Plays the AI disclosure, then the first script prompt, and opens a <Gather>
 * to capture the customer's speech response.
 *
 * @param webhookBaseUrl  Base URL for webhook callbacks
 * @param callId          Call record ID
 * @param firstPrompt     First script step prompt text
 */
export function buildVoiceAiOpeningTwiml(
  webhookBaseUrl: string,
  callId: string,
  firstPrompt: string,
): string {
  const gatherUrl = `${webhookBaseUrl}/calls/${callId}/voice-ai/gather`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escapeXml(DISCLOSURE_MESSAGE)}</Say>
  <Gather input="speech" action="${gatherUrl}" method="POST" speechTimeout="auto" timeout="5">
    <Say voice="alice">${escapeXml(firstPrompt)}</Say>
  </Gather>
  <Redirect method="POST">${gatherUrl}</Redirect>
</Response>`;
}

/**
 * Build TwiML for a mid-call script step.
 * Speaks the prompt and gathers the next customer utterance.
 */
export function buildVoiceAiStepTwiml(
  webhookBaseUrl: string,
  callId: string,
  prompt: string,
): string {
  const gatherUrl = `${webhookBaseUrl}/calls/${callId}/voice-ai/gather`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${gatherUrl}" method="POST" speechTimeout="auto" timeout="5">
    <Say voice="alice">${escapeXml(prompt)}</Say>
  </Gather>
  <Redirect method="POST">${gatherUrl}</Redirect>
</Response>`;
}

/**
 * Build TwiML to transfer the call to a human operator via <Dial>.
 * Plays a brief hold message before dialing the operator queue.
 *
 * @param operatorNumber  E.164 number or queue name to dial
 * @param dialTimeoutSecs Timeout before giving up (default 30 s per requirements)
 * @param fallbackUrl     URL to redirect to if dial fails / times out
 */
export function buildHumanTransferTwiml(
  operatorNumber: string,
  dialTimeoutSecs: number = 30,
  fallbackUrl?: string,
): string {
  const action = fallbackUrl ? ` action="${fallbackUrl}"` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">Please hold while I connect you to a human representative.</Say>
  <Dial timeout="${dialTimeoutSecs}"${action}>
    <Number>${escapeXml(operatorNumber)}</Number>
  </Dial>
  <Say voice="alice">We were unable to connect you to an agent at this time. Please call back later. Goodbye.</Say>
</Response>`;
}

/**
 * Build TwiML for an outbound Voice AI call with AMD (Answering Machine Detection).
 * Twilio will call the amdCallbackUrl with the detection result before connecting.
 *
 * @param twimlUrl        URL that serves the actual call TwiML once connected
 * @param amdCallbackUrl  URL Twilio POSTs AMD result to
 */
export function buildVoiceAiOutboundWithAmd(twimlUrl: string, amdCallbackUrl: string): object {
  // AMD is configured at call creation time via Twilio API params, not TwiML.
  // This helper returns the extra params to pass to twilio.calls.create().
  return {
    machineDetection: 'DetectMessageEnd',
    asyncAmd: 'true',
    asyncAmdStatusCallback: amdCallbackUrl,
    asyncAmdStatusCallbackMethod: 'POST',
    url: twimlUrl,
  };
}

/**
 * Build TwiML to leave a voicemail message (played when AMD detects answering machine).
 *
 * @param voicemailMessage  Text to speak as the voicemail
 */
export function buildVoicemailMessageTwiml(voicemailMessage: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escapeXml(voicemailMessage)}</Say>
  <Hangup/>
</Response>`;
}

/**
 * Build TwiML for call end / script completion.
 */
export function buildVoiceAiEndTwiml(closingMessage: string = 'Thank you for your time. Goodbye.'): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">${escapeXml(closingMessage)}</Say>
  <Hangup/>
</Response>`;
}

/** Escape special XML characters to prevent TwiML injection */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
