/**
 * Voice AI routes — registered on the existing Call Engine Fastify server.
 *
 * New endpoints:
 *   POST /calls/voice-ai/start              — initiate a Voice AI outbound call
 *   GET  /calls/:id/voice-ai/twiml          — serve opening TwiML
 *   POST /calls/:id/voice-ai/gather         — handle <Gather> STT callback
 *   POST /calls/:id/voice-ai/amd            — handle AMD (voicemail detection) callback
 *   POST /calls/:id/voice-ai/transfer-failed — fallback when human transfer times out
 *
 * Power dialer integration:
 *   POST /calls/power-dialer/start accepts use_voice_ai flag (handled here)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { TwilioClient } from '../twilio.client.js';
import type { CallConfig } from '../config.js';
import type { CallScript } from '../voice-ai/script-engine.js';
import {
  startVoiceAiCall,
  handleVoiceAiTwiml,
  handleGatherCallback,
  handleAmdCallback,
  handleTransferFailed,
  handleNoAnswer,
} from '../voice-ai/voice-ai.service.js';
import {
  startPowerDialerWithVoiceAi,
} from '../power-dialer.js';

/** Default voicemail message — configurable per tenant in production */
const DEFAULT_VOICEMAIL_MESSAGE =
  'Hello, this is an automated message. We tried to reach you today. Please call us back at your earliest convenience. Thank you.';

/** Default operator number — override via config or request body in production */
const DEFAULT_OPERATOR_NUMBER = process.env['OPERATOR_PHONE_NUMBER'] ?? '+10000000000';

export function registerVoiceAiRoutes(
  app: FastifyInstance,
  twilioClient: TwilioClient,
  config: CallConfig,
): void {
  // ── POST /calls/voice-ai/start — initiate a Voice AI outbound call ─────────
  app.post(
    '/calls/voice-ai/start',
    async (
      request: FastifyRequest<{
        Body: {
          to: string;
          contact_id?: string;
          script: CallScript;
          operator_number?: string;
          voicemail_message?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const { to, contact_id, script, operator_number } = request.body;

      if (!to) {
        return reply.status(400).send({ error: 'Bad Request', message: 'to is required' });
      }

      if (!script?.steps?.length) {
        return reply.status(400).send({ error: 'Bad Request', message: 'script.steps must be non-empty' });
      }

      try {
        const result = await startVoiceAiCall({
          tenantId,
          to,
          contactId: contact_id ?? null,
          script,
          operatorNumber: operator_number ?? DEFAULT_OPERATOR_NUMBER,
          twilioClient,
          config,
        });
        return reply.status(201).send(result);
      } catch (err) {
        app.log.error({ err }, 'Failed to start Voice AI call');
        return reply.status(502).send({ error: 'Failed to initiate Voice AI call' });
      }
    },
  );

  // ── GET /calls/:id/voice-ai/twiml — serve opening TwiML ───────────────────
  app.get(
    '/calls/:id/voice-ai/twiml',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const twiml = handleVoiceAiTwiml(request.params.id, config.webhookBaseUrl);
      return reply.status(200).header('Content-Type', 'text/xml').send(twiml);
    },
  );

  // ── POST /calls/:id/voice-ai/gather — <Gather> STT callback ───────────────
  app.post(
    '/calls/:id/voice-ai/gather',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          SpeechResult?: string;
          Confidence?: string;
          tenant_id?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const callId = request.params.id;
      const utterance = request.body.SpeechResult ?? '';

      const result = await handleGatherCallback(callId, utterance, config.webhookBaseUrl);

      return reply.status(200).header('Content-Type', 'text/xml').send(result.twiml);
    },
  );

  // ── POST /calls/:id/voice-ai/amd — AMD voicemail detection callback ────────
  app.post(
    '/calls/:id/voice-ai/amd',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          AnsweredBy?: string;
          tenant_id?: string;
          voicemail_message?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const callId = request.params.id;
      const answeredBy = request.body.AnsweredBy ?? 'unknown';
      const voicemailMessage = request.body.voicemail_message ?? DEFAULT_VOICEMAIL_MESSAGE;

      const result = await handleAmdCallback(callId, answeredBy, voicemailMessage);

      if (result.twiml) {
        return reply.status(200).header('Content-Type', 'text/xml').send(result.twiml);
      }

      // Human answered — no TwiML override needed
      return reply.status(200).send({ ok: true, outcome: result.outcome });
    },
  );

  // ── POST /calls/:id/voice-ai/transfer-failed — human transfer timeout ──────
  app.post(
    '/calls/:id/voice-ai/transfer-failed',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const twiml = await handleTransferFailed(request.params.id);
      return reply.status(200).header('Content-Type', 'text/xml').send(twiml);
    },
  );

  // ── POST /calls/power-dialer/voice-ai/start — power dialer with Voice AI ───
  // (21.5) When use_voice_ai=true, use Voice AI TwiML instead of standard outbound TwiML
  app.post(
    '/calls/power-dialer/voice-ai/start',
    async (
      request: FastifyRequest<{
        Body: {
          contact_ids: string[];
          script: CallScript;
          operator_number?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const { contact_ids, script, operator_number } = request.body;

      if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'contact_ids must be a non-empty array',
        });
      }

      if (!script?.steps?.length) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'script.steps must be non-empty',
        });
      }

      try {
        const session = await startPowerDialerWithVoiceAi(
          tenantId,
          contact_ids,
          script,
          operator_number ?? DEFAULT_OPERATOR_NUMBER,
          twilioClient,
          config,
        );
        return reply.status(201).send({
          session_id: session.session_id,
          status: session.status,
          use_voice_ai: session.use_voice_ai,
          total_contacts: session.contact_ids.length,
          current_index: session.current_index,
          current_call_id: session.current_call_id,
        });
      } catch (err) {
        app.log.error({ err }, 'Failed to start Voice AI power dialer');
        return reply.status(500).send({ error: 'Failed to start Voice AI power dialer session' });
      }
    },
  );
}
