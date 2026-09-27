import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  createCall,
  getCall,
  updateCall,
  NotFoundError,
  ValidationError,
  isValidE164,
} from '../call.service.js';
import {
  buildOutboundTwiml,
  buildInboundTwiml,
  buildVoicemailTwiml,
} from '../twilio.client.js';
import { getSignedRecordingUrl } from '../s3.js';
import { processCompletedCall } from '../transcript.worker.js';
import { startPowerDialer, onCallCompleted, getSession } from '../power-dialer.js';
import type { TwilioClient } from '../twilio.client.js';
import type { CallConfig } from '../config.js';

export function registerCallRoutes(
  app: FastifyInstance,
  twilioClient: TwilioClient,
  config: CallConfig,
): void {
  // ── POST /calls/outbound — initiate outbound call ─────────────────────────
  app.post(
    '/calls/outbound',
    async (
      request: FastifyRequest<{
        Body: {
          to: string;
          contact_id?: string;
          is_voice_ai?: boolean;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const { to, contact_id, is_voice_ai = false } = request.body;

      if (!to || !isValidE164(to)) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'to must be a valid E.164 phone number (e.g. +15551234567)',
        });
      }

      const call = await createCall(tenantId, {
        contact_id: contact_id ?? null,
        direction: 'outbound',
        status: 'initiated',
        is_voice_ai,
      });

      const twimlUrl = `${config.webhookBaseUrl}/calls/${call.call_id}/twiml`;
      const statusCallbackUrl = `${config.webhookBaseUrl}/calls/${call.call_id}/status`;

      try {
        await twilioClient.initiateOutboundCall({
          to,
          from: config.twilioPhoneNumber,
          twimlUrl,
          statusCallbackUrl,
        });

        await updateCall(tenantId, call.call_id, { status: 'connected' });
      } catch (err) {
        await updateCall(tenantId, call.call_id, { status: 'failed' });
        app.log.error({ err }, 'Failed to initiate outbound call');
        return reply.status(502).send({ error: 'Failed to initiate call via telephony provider' });
      }

      return reply.status(201).send(call);
    },
  );

  // ── POST /calls/inbound/route — IVR routing webhook (called by Twilio) ────
  app.post(
    '/calls/inbound/route',
    async (
      request: FastifyRequest<{
        Body: {
          From?: string;
          To?: string;
          CallSid?: string;
          tenant_id?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      // Twilio webhooks don't carry JWT — tenant_id comes from query param or body
      const tenantId = (request.query as Record<string, string>)['tenant_id']
        ?? request.body.tenant_id
        ?? request.auth?.tenant_id;

      if (!tenantId) {
        return reply
          .status(400)
          .header('Content-Type', 'text/xml')
          .send('<Response><Say>Configuration error. Goodbye.</Say></Response>');
      }

      const callerPhone = request.body.From ?? '';

      const call = await createCall(tenantId, {
        contact_id: null,
        direction: 'inbound',
        status: 'initiated',
        is_voice_ai: false,
      });

      // Simple operator availability check (stub — replace with real queue check)
      const operatorAvailable = false;

      const twiml = buildInboundTwiml(config.webhookBaseUrl, call.call_id, operatorAvailable);

      // Store caller phone for later contact association
      app.log.info({ callId: call.call_id, callerPhone }, 'Inbound call routed');

      return reply
        .status(200)
        .header('Content-Type', 'text/xml')
        .send(twiml);
    },
  );

  // ── GET /calls/:id/twiml — serve TwiML for a call ─────────────────────────
  app.get(
    '/calls/:id/twiml',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const callId = request.params.id;
      const twiml = buildOutboundTwiml(config.webhookBaseUrl, callId);
      return reply.status(200).header('Content-Type', 'text/xml').send(twiml);
    },
  );

  // ── POST /calls/:id/status — Twilio status callback ───────────────────────
  app.post(
    '/calls/:id/status',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          CallStatus?: string;
          CallDuration?: string;
          RecordingUrl?: string;
          From?: string;
          tenant_id?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const callId = request.params.id;
      const tenantId = (request.query as Record<string, string>)['tenant_id']
        ?? request.body.tenant_id
        ?? request.auth?.tenant_id;

      if (!tenantId) return reply.status(400).send({ error: 'tenant_id required' });

      const { CallStatus, CallDuration, RecordingUrl, From } = request.body;

      const statusMap: Record<string, 'initiated' | 'connected' | 'completed' | 'failed' | 'voicemail'> = {
        initiated: 'initiated',
        ringing: 'initiated',
        'in-progress': 'connected',
        completed: 'completed',
        busy: 'failed',
        failed: 'failed',
        'no-answer': 'failed',
        canceled: 'failed',
      };

      const status = statusMap[CallStatus ?? ''] ?? 'failed';
      const durationSeconds = CallDuration ? parseInt(CallDuration, 10) : undefined;

      const updateData: Parameters<typeof updateCall>[2] = {
        status,
        ...(durationSeconds !== undefined && { duration_seconds: durationSeconds }),
        ...(status === 'completed' || status === 'failed' ? { ended_at: new Date() } : {}),
        ...(RecordingUrl ? { recording_url: RecordingUrl } : {}),
      };

      try {
        await updateCall(tenantId, callId, updateData);
      } catch {
        // Call may not exist yet — ignore
      }

      // Trigger async transcript processing on completion
      if (status === 'completed' && RecordingUrl) {
        void processCompletedCall(tenantId, callId, RecordingUrl, From ?? null, config).catch(
          (err) => app.log.error({ err }, 'Transcript processing failed'),
        );
      }

      return reply.status(200).send({ ok: true });
    },
  );

  // ── POST /calls/:id/voicemail-complete — voicemail recording complete ──────
  app.post(
    '/calls/:id/voicemail-complete',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { RecordingUrl?: string; tenant_id?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const callId = request.params.id;
      const tenantId = (request.query as Record<string, string>)['tenant_id']
        ?? request.body.tenant_id
        ?? request.auth?.tenant_id;

      if (!tenantId) return reply.status(400).send({ error: 'tenant_id required' });

      const { RecordingUrl } = request.body;

      await updateCall(tenantId, callId, {
        status: 'voicemail',
        ended_at: new Date(),
        ...(RecordingUrl ? { recording_url: RecordingUrl } : {}),
      }).catch(() => {/* ignore if not found */});

      return reply
        .status(200)
        .header('Content-Type', 'text/xml')
        .send('<Response></Response>');
    },
  );

  // ── GET /calls/:id — call record with transcript and sentiment ─────────────
  app.get(
    '/calls/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        const call = await getCall(tenantId, request.params.id);
        return reply.send(call);
      } catch (err) {
        if (err instanceof NotFoundError) return reply.status(404).send({ error: 'Not Found' });
        throw err;
      }
    },
  );

  // ── GET /calls/:id/recording — signed URL to call recording ───────────────
  app.get(
    '/calls/:id/recording',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      try {
        const call = await getCall(tenantId, request.params.id);

        if (!call.recording_url) {
          return reply.status(404).send({ error: 'No recording available for this call' });
        }

        // If it's an S3 URL, generate a signed URL; otherwise return the Twilio URL directly
        if (call.recording_url.startsWith('s3://')) {
          const signedUrl = await getSignedRecordingUrl(
            config.s3Bucket,
            config.s3Region,
            call.call_id,
          );
          return reply.send({ url: signedUrl, expires_in: 3600 });
        }

        return reply.send({ url: call.recording_url });
      } catch (err) {
        if (err instanceof NotFoundError) return reply.status(404).send({ error: 'Not Found' });
        throw err;
      }
    },
  );

  // ── POST /calls/power-dialer/start — start power dialer session ───────────
  app.post(
    '/calls/power-dialer/start',
    async (
      request: FastifyRequest<{
        Body: { contact_ids: string[] };
      }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const { contact_ids } = request.body;

      if (!Array.isArray(contact_ids) || contact_ids.length === 0) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'contact_ids must be a non-empty array',
        });
      }

      try {
        const session = await startPowerDialer(tenantId, contact_ids, twilioClient, config);
        return reply.status(201).send({
          session_id: session.session_id,
          status: session.status,
          total_contacts: session.contact_ids.length,
          current_index: session.current_index,
          current_call_id: session.current_call_id,
        });
      } catch (err) {
        app.log.error({ err }, 'Failed to start power dialer');
        return reply.status(500).send({ error: 'Failed to start power dialer session' });
      }
    },
  );

  // ── GET /calls/power-dialer/:sessionId — get dialer session status ─────────
  app.get(
    '/calls/power-dialer/:sessionId',
    async (request: FastifyRequest<{ Params: { sessionId: string } }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const session = getSession(request.params.sessionId);
      if (!session || session.tenant_id !== tenantId) {
        return reply.status(404).send({ error: 'Session not found' });
      }

      return reply.send(session);
    },
  );
}
