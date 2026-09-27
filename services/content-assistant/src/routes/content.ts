import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ContentAiAdapter } from '../ai-adapter.js';
import { extractMergeFields, truncateSms } from '../ai-adapter.js';
import type { ContentAssistantConfig } from '../config.js';

// ─── Request body types ───────────────────────────────────────────────────────

interface EmailBody {
  goal: string;
  audience: string;
  tone: 'professional' | 'casual' | 'friendly' | 'urgent';
  regeneration_index?: number;
}

interface SmsBody {
  objective: string;
  segment_context: string;
  regeneration_index?: number;
}

interface ChatbotScriptBody {
  use_case: string;
  regeneration_index?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const VALID_TONES = ['professional', 'casual', 'friendly', 'urgent'] as const;

function validateRegenerationIndex(value: unknown): number {
  const idx = typeof value === 'number' ? value : 0;
  if (!Number.isInteger(idx) || idx < 0 || idx > 4) {
    throw new RangeError('regeneration_index must be an integer between 0 and 4');
  }
  return idx;
}

/**
 * Wrap a generation promise with a timeout.
 * Rejects with a timeout error after `ms` milliseconds.
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Generation timed out after ${ms}ms`));
    }, ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerContentRoutes(
  app: FastifyInstance,
  ai: ContentAiAdapter,
  config: ContentAssistantConfig,
): void {
  // POST /content/email
  app.post(
    '/content/email',
    async (request: FastifyRequest<{ Body: EmailBody }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const { goal, audience, tone, regeneration_index } = request.body;

      if (!goal || typeof goal !== 'string') {
        return reply.status(400).send({ error: 'Bad Request', message: '`goal` is required' });
      }
      if (!audience || typeof audience !== 'string') {
        return reply.status(400).send({ error: 'Bad Request', message: '`audience` is required' });
      }
      if (!tone || !VALID_TONES.includes(tone)) {
        return reply.status(400).send({
          error: 'Bad Request',
          message: `\`tone\` must be one of: ${VALID_TONES.join(', ')}`,
        });
      }

      let regenIdx: number;
      try {
        regenIdx = validateRegenerationIndex(regeneration_index);
      } catch {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'regeneration_index must be an integer between 0 and 4',
        });
      }

      if (!ai.isAvailable()) {
        return reply.status(503).send({
          error: 'Service Unavailable',
          message: 'AI generation service is currently unavailable',
          partial_draft: null,
        });
      }

      try {
        const draft = await withTimeout(
          ai.generateEmail(goal, audience, tone, regenIdx),
          config.generationTimeoutMs,
        );

        return reply.status(200).send({
          type: 'email',
          regeneration_index: regenIdx,
          draft: {
            subject: draft.subject,
            body: draft.body,
          },
          merge_fields: [
            ...extractMergeFields(draft.subject),
            ...extractMergeFields(draft.body),
          ].filter((v, i, a) => a.indexOf(v) === i),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Generation failed';
        const isTimeout = message.includes('timed out');
        return reply.status(503).send({
          error: 'Service Unavailable',
          message: isTimeout ? 'Generation timed out (10s limit exceeded)' : message,
          partial_draft: null,
        });
      }
    },
  );

  // POST /content/sms
  app.post(
    '/content/sms',
    async (request: FastifyRequest<{ Body: SmsBody }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const { objective, segment_context, regeneration_index } = request.body;

      if (!objective || typeof objective !== 'string') {
        return reply
          .status(400)
          .send({ error: 'Bad Request', message: '`objective` is required' });
      }
      if (segment_context === undefined || segment_context === null) {
        return reply
          .status(400)
          .send({ error: 'Bad Request', message: '`segment_context` is required' });
      }

      let regenIdx: number;
      try {
        regenIdx = validateRegenerationIndex(regeneration_index);
      } catch {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'regeneration_index must be an integer between 0 and 4',
        });
      }

      if (!ai.isAvailable()) {
        return reply.status(503).send({
          error: 'Service Unavailable',
          message: 'AI generation service is currently unavailable',
          partial_draft: null,
        });
      }

      try {
        const draft = await withTimeout(
          ai.generateSms(objective, segment_context, regenIdx),
          config.generationTimeoutMs,
        );

        // Enforce ≤160 character constraint
        const message = truncateSms(draft.message);

        return reply.status(200).send({
          type: 'sms',
          regeneration_index: regenIdx,
          draft: {
            message,
            character_count: message.length,
          },
          merge_fields: extractMergeFields(message),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Generation failed';
        const isTimeout = message.includes('timed out');
        return reply.status(503).send({
          error: 'Service Unavailable',
          message: isTimeout ? 'Generation timed out (10s limit exceeded)' : message,
          partial_draft: null,
        });
      }
    },
  );

  // POST /content/chatbot-script
  app.post(
    '/content/chatbot-script',
    async (request: FastifyRequest<{ Body: ChatbotScriptBody }>, reply: FastifyReply) => {
      const tenantId = request.auth?.tenant_id;
      if (!tenantId) return reply.status(401).send({ error: 'Unauthorized' });

      const { use_case, regeneration_index } = request.body;

      if (!use_case || typeof use_case !== 'string') {
        return reply
          .status(400)
          .send({ error: 'Bad Request', message: '`use_case` is required' });
      }

      let regenIdx: number;
      try {
        regenIdx = validateRegenerationIndex(regeneration_index);
      } catch {
        return reply.status(400).send({
          error: 'Bad Request',
          message: 'regeneration_index must be an integer between 0 and 4',
        });
      }

      if (!ai.isAvailable()) {
        return reply.status(503).send({
          error: 'Service Unavailable',
          message: 'AI generation service is currently unavailable',
          partial_draft: null,
        });
      }

      try {
        const draft = await withTimeout(
          ai.generateChatbotScript(use_case, regenIdx),
          config.generationTimeoutMs,
        );

        const allText = [
          draft.greeting,
          ...draft.qualification_questions,
          draft.closing,
        ].join(' ');

        return reply.status(200).send({
          type: 'chatbot-script',
          regeneration_index: regenIdx,
          draft: {
            greeting: draft.greeting,
            qualification_questions: draft.qualification_questions,
            closing: draft.closing,
          },
          merge_fields: extractMergeFields(allText),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Generation failed';
        const isTimeout = message.includes('timed out');
        return reply.status(503).send({
          error: 'Service Unavailable',
          message: isTimeout ? 'Generation timed out (10s limit exceeded)' : message,
          partial_draft: null,
        });
      }
    },
  );
}
