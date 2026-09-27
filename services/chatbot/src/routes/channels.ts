/**
 * Multi-channel deployment adapters.
 *
 * - Website widget embed script (served as JS)
 * - WhatsApp webhook handler stub
 * - Facebook Messenger webhook handler stub
 * - SMS webhook handler stub
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AiAdapter } from '../ai-adapter.js';
import type { ChatbotConfig } from '../config.js';
import { createConversation, appendTranscript, getAgent } from '../agent.service.js';
import { shouldEscalate, triggerEscalation, FALLBACK_MESSAGE } from '../escalation.service.js';

// ─── Widget embed script ──────────────────────────────────────────────────────

const WIDGET_SCRIPT = (chatbotUrl: string) => `
(function() {
  'use strict';
  var CHATBOT_URL = '${chatbotUrl}';

  function init(config) {
    var agentId = config.agentId;
    var tenantId = config.tenantId;
    var containerId = config.containerId || 'chatbot-widget';

    var container = document.getElementById(containerId);
    if (!container) {
      container = document.createElement('div');
      container.id = containerId;
      container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:9999;';
      document.body.appendChild(container);
    }

    var ws = null;
    var conversationId = null;

    function connect() {
      ws = new WebSocket(CHATBOT_URL + '/chat');
      ws.onopen = function() {
        ws.send(JSON.stringify({ type: 'init', tenant_id: tenantId, agent_id: agentId, channel: 'widget' }));
      };
      ws.onmessage = function(event) {
        var msg = JSON.parse(event.data);
        if (msg.type === 'session') { conversationId = msg.conversation_id; }
        if (msg.type === 'message') { renderMessage(msg.role, msg.content); }
      };
    }

    function renderMessage(role, content) {
      var el = document.createElement('div');
      el.className = 'chatbot-msg chatbot-msg--' + role;
      el.textContent = content;
      var feed = document.getElementById('chatbot-feed');
      if (feed) { feed.appendChild(el); feed.scrollTop = feed.scrollHeight; }
    }

    function sendMessage(text) {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'message', content: text }));
        renderMessage('user', text);
      }
    }

    container.innerHTML = [
      '<div id="chatbot-feed" style="height:300px;overflow-y:auto;border:1px solid #ccc;padding:8px;background:#fff;"></div>',
      '<div style="display:flex;margin-top:4px;">',
      '  <input id="chatbot-input" type="text" placeholder="Type a message..." style="flex:1;padding:6px;" />',
      '  <button id="chatbot-send" style="padding:6px 12px;">Send</button>',
      '</div>',
    ].join('');

    document.getElementById('chatbot-send').addEventListener('click', function() {
      var input = document.getElementById('chatbot-input');
      if (input.value.trim()) { sendMessage(input.value.trim()); input.value = ''; }
    });

    document.getElementById('chatbot-input').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') { document.getElementById('chatbot-send').click(); }
    });

    connect();
  }

  window.PlatformChatbot = { init: init };
})();
`.trim();

// ─── Shared: process inbound channel message ──────────────────────────────────

async function processChannelMessage(
  tenantId: string,
  agentId: string,
  contactId: string | null,
  channel: 'whatsapp' | 'facebook' | 'sms',
  userMessage: string,
  ai: AiAdapter,
  config: ChatbotConfig,
): Promise<string> {
  const agent = await getAgent(tenantId, agentId);
  const conv = await createConversation(tenantId, { agent_id: agentId, contact_id: contactId, channel });

  await appendTranscript(tenantId, conv.conversation_id, { role: 'user', content: userMessage });

  let aiResponse: { content: string; confidence: number; available: boolean };
  try {
    aiResponse = await ai.chat([{ role: 'user', content: userMessage }], agent.persona || undefined);
  } catch {
    aiResponse = { content: FALLBACK_MESSAGE, confidence: 0, available: false };
  }

  await appendTranscript(tenantId, conv.conversation_id, {
    role: 'assistant',
    content: aiResponse.content,
    confidence: aiResponse.confidence,
  });

  if (!aiResponse.available || shouldEscalate(aiResponse.confidence, agent.escalation_threshold)) {
    const reason = !aiResponse.available ? 'AI model unavailable' : `Low confidence: ${aiResponse.confidence.toFixed(2)}`;
    void triggerEscalation(tenantId, conv.conversation_id, contactId, agentId, reason, config.kafkaBrokers).catch(() => {});
  }

  return aiResponse.content;
}

// ─── Route registration ───────────────────────────────────────────────────────

export function registerChannelRoutes(
  app: FastifyInstance,
  ai: AiAdapter,
  config: ChatbotConfig,
): void {
  // GET /widget.js — serve embed script
  app.get('/widget.js', async (request: FastifyRequest, reply: FastifyReply) => {
    const host = request.headers.host ?? `localhost:${config.port}`;
    const proto = request.headers['x-forwarded-proto'] ?? 'ws';
    const wsUrl = `${proto === 'https' ? 'wss' : 'ws'}://${host}`;
    return reply
      .header('Content-Type', 'application/javascript; charset=utf-8')
      .header('Cache-Control', 'public, max-age=300')
      .send(WIDGET_SCRIPT(wsUrl));
  });

  // POST /webhooks/whatsapp — WhatsApp Cloud API webhook
  app.post(
    '/webhooks/whatsapp',
    async (
      request: FastifyRequest<{
        Body: {
          entry?: Array<{
            changes?: Array<{
              value?: {
                messages?: Array<{ from: string; text?: { body: string } }>;
                metadata?: { phone_number_id: string };
              };
            }>;
          }>;
          tenant_id?: string;
          agent_id?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      // WhatsApp sends a verification challenge on GET — handled separately if needed
      const tenantId = request.body?.tenant_id ?? '';
      const agentId = request.body?.agent_id ?? '';
      const messages = request.body?.entry?.[0]?.changes?.[0]?.value?.messages ?? [];

      if (!tenantId || !agentId || messages.length === 0) {
        return reply.status(200).send({ status: 'ok' }); // Always 200 to WhatsApp
      }

      for (const waMsgObj of messages) {
        const userText = waMsgObj.text?.body ?? '';
        if (!userText) continue;
        void processChannelMessage(tenantId, agentId, null, 'whatsapp', userText, ai, config).catch(
          (err) => app.log.error({ err }, 'WhatsApp message processing failed'),
        );
      }

      return reply.status(200).send({ status: 'ok' });
    },
  );

  // GET /webhooks/whatsapp — WhatsApp webhook verification
  app.get(
    '/webhooks/whatsapp',
    async (
      request: FastifyRequest<{
        Querystring: { 'hub.mode'?: string; 'hub.verify_token'?: string; 'hub.challenge'?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const qs = request.query as Record<string, string>;
      if (qs['hub.mode'] === 'subscribe') {
        return reply.status(200).send(qs['hub.challenge'] ?? '');
      }
      return reply.status(403).send({ error: 'Forbidden' });
    },
  );

  // POST /webhooks/facebook — Facebook Messenger webhook
  app.post(
    '/webhooks/facebook',
    async (
      request: FastifyRequest<{
        Body: {
          entry?: Array<{
            messaging?: Array<{ sender?: { id: string }; message?: { text: string } }>;
          }>;
          tenant_id?: string;
          agent_id?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.body?.tenant_id ?? '';
      const agentId = request.body?.agent_id ?? '';
      const messaging = request.body?.entry?.[0]?.messaging ?? [];

      if (!tenantId || !agentId || messaging.length === 0) {
        return reply.status(200).send({ status: 'ok' });
      }

      for (const fbMsg of messaging) {
        const userText = fbMsg.message?.text ?? '';
        if (!userText) continue;
        void processChannelMessage(tenantId, agentId, null, 'facebook', userText, ai, config).catch(
          (err) => app.log.error({ err }, 'Facebook message processing failed'),
        );
      }

      return reply.status(200).send({ status: 'ok' });
    },
  );

  // GET /webhooks/facebook — Facebook webhook verification
  app.get(
    '/webhooks/facebook',
    async (
      request: FastifyRequest<{
        Querystring: { 'hub.mode'?: string; 'hub.verify_token'?: string; 'hub.challenge'?: string };
      }>,
      reply: FastifyReply,
    ) => {
      const qs = request.query as Record<string, string>;
      if (qs['hub.mode'] === 'subscribe') {
        return reply.status(200).send(qs['hub.challenge'] ?? '');
      }
      return reply.status(403).send({ error: 'Forbidden' });
    },
  );

  // POST /webhooks/sms — SMS provider webhook (Twilio / Vonage)
  app.post(
    '/webhooks/sms',
    async (
      request: FastifyRequest<{
        Body: {
          From?: string;
          Body?: string;
          tenant_id?: string;
          agent_id?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const tenantId = request.body?.tenant_id ?? '';
      const agentId = request.body?.agent_id ?? '';
      const userText = request.body?.Body ?? '';

      if (!tenantId || !agentId || !userText) {
        return reply.status(200).send({ status: 'ok' });
      }

      void processChannelMessage(tenantId, agentId, null, 'sms', userText, ai, config).catch(
        (err) => app.log.error({ err }, 'SMS message processing failed'),
      );

      return reply.status(200).send({ status: 'ok' });
    },
  );
}
