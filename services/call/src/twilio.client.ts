import twilio from 'twilio';
import type { CallConfig } from './config.js';

export interface TwilioClient {
  initiateOutboundCall(params: {
    to: string;
    from: string;
    statusCallbackUrl: string;
    twimlUrl: string;
  }): Promise<{ sid: string }>;
  getRecordingUrl(recordingSid: string): string;
}

export function createTwilioClient(config: CallConfig): TwilioClient {
  const client = twilio(config.twilioAccountSid, config.twilioAuthToken);

  return {
    async initiateOutboundCall({ to, from, statusCallbackUrl, twimlUrl }) {
      const call = await client.calls.create({
        to,
        from,
        url: twimlUrl,
        statusCallback: statusCallbackUrl,
        statusCallbackMethod: 'POST',
        record: true,
        recordingStatusCallback: statusCallbackUrl.replace('/status', '/recording'),
      });
      return { sid: call.sid };
    },

    getRecordingUrl(recordingSid: string): string {
      return `https://api.twilio.com/2010-04-01/Accounts/${config.twilioAccountSid}/Recordings/${recordingSid}.mp3`;
    },
  };
}

/**
 * Build TwiML for outbound call with consent disclosure and recording.
 */
export function buildOutboundTwiml(webhookBaseUrl: string, callId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">This call may be recorded for quality and training purposes. By continuing, you consent to this recording.</Say>
  <Record
    action="${webhookBaseUrl}/calls/${callId}/recording-complete"
    recordingStatusCallback="${webhookBaseUrl}/calls/${callId}/recording-status"
    transcribe="false"
    maxLength="3600"
    playBeep="false"
  />
</Response>`;
}

/**
 * Build TwiML for inbound IVR routing with voicemail fallback.
 */
export function buildInboundTwiml(webhookBaseUrl: string, callId: string, operatorAvailable: boolean): string {
  if (operatorAvailable) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">This call may be recorded for quality and training purposes.</Say>
  <Dial action="${webhookBaseUrl}/calls/${callId}/dial-complete" timeout="30">
    <Queue>${callId}</Queue>
  </Dial>
</Response>`;
  }

  // No operator available — offer voicemail
  return buildVoicemailTwiml(webhookBaseUrl, callId);
}

/**
 * Build TwiML for voicemail fallback.
 */
export function buildVoicemailTwiml(webhookBaseUrl: string, callId: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="alice">All of our agents are currently unavailable. Please leave a message after the beep and we will get back to you shortly.</Say>
  <Record
    action="${webhookBaseUrl}/calls/${callId}/voicemail-complete"
    recordingStatusCallback="${webhookBaseUrl}/calls/${callId}/voicemail-status"
    maxLength="120"
    playBeep="true"
    transcribe="false"
  />
  <Say voice="alice">Thank you for your message. Goodbye.</Say>
</Response>`;
}
