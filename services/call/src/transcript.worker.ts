/**
 * Post-call transcript and sentiment analysis worker.
 *
 * Runs asynchronously after a call completes. Transcribes the recording
 * via an AI adapter stub and computes a sentiment score (-1 to 1).
 * Results are written back to the call record within 2 minutes.
 */

import { updateCall, findContactByPhone } from './call.service.js';
import { EventPublisher } from '@platform/events';
import type { CallConfig } from './config.js';

export interface TranscriptResult {
  transcript: string;
  sentimentScore: number; // -1 (negative) to 1 (positive)
}

/**
 * AI adapter stub — replace with real STT/NLP service integration.
 * Returns a transcript and sentiment score for the given recording URL.
 */
export async function transcribeAndAnalyze(recordingUrl: string): Promise<TranscriptResult> {
  // Stub: in production, call a real STT service (e.g. AWS Transcribe, Deepgram)
  // and an NLP sentiment model.
  console.log(`[transcript-worker] Transcribing recording: ${recordingUrl}`);

  // Simulate async processing delay
  await new Promise((resolve) => setTimeout(resolve, 100));

  return {
    transcript: `[Transcript stub for recording: ${recordingUrl}]`,
    sentimentScore: 0.0, // neutral stub
  };
}

/**
 * Process a completed call: transcribe, compute sentiment, update DB, publish event.
 * Must complete within 2 minutes per requirements.
 */
export async function processCompletedCall(
  tenantId: string,
  callId: string,
  recordingUrl: string,
  contactPhone: string | null,
  config: CallConfig,
): Promise<void> {
  const TIMEOUT_MS = 2 * 60 * 1000; // 2 minutes

  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Transcript processing timed out after 2 minutes')), TIMEOUT_MS),
  );

  const workPromise = async (): Promise<void> => {
    const { transcript, sentimentScore } = await transcribeAndAnalyze(recordingUrl);

    // Associate call with contact by phone number if not already linked
    let contactId: string | null = null;
    if (contactPhone) {
      contactId = await findContactByPhone(tenantId, contactPhone);
    }

    const updateData: Parameters<typeof updateCall>[2] = {
      transcript,
      sentiment_score: sentimentScore,
    };
    if (contactId) {
      updateData.contact_id = contactId;
    }

    await updateCall(tenantId, callId, updateData);

    // Publish transcript ready event
    const publisher = new EventPublisher(tenantId, { brokers: config.kafkaBrokers });
    try {
      await publisher.connect();
      await publisher.publish('call-events', 'call.transcript.ready', {
        call_id: callId,
        contact_id: contactId ?? '',
        transcript,
        sentiment_score: sentimentScore,
      });
    } finally {
      await publisher.disconnect();
    }

    console.log(`[transcript-worker] Completed processing for call ${callId}`);
  };

  await Promise.race([workPromise(), timeoutPromise]);
}
