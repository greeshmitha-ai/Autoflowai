/**
 * Proxy route registration for the API Gateway.
 *
 * Each downstream service is mapped to a URL prefix. In production these
 * would use a proper HTTP proxy plugin (e.g. @fastify/http-proxy). Here we
 * register typed stubs that document the routing table and return 503 when
 * the downstream URL is not configured.
 */
import type { FastifyInstance } from 'fastify';

export interface ServiceRoutes {
  prefix: string;
  envVar: string;
  description: string;
}

/**
 * All downstream service route mappings.
 * prefix   — the URL prefix the gateway listens on
 * envVar   — environment variable that holds the downstream base URL
 */
export const SERVICE_ROUTES: ServiceRoutes[] = [
  { prefix: '/auth',              envVar: 'AUTH_SERVICE_URL',              description: 'Auth Service' },
  { prefix: '/contacts',          envVar: 'CONTACT_SERVICE_URL',           description: 'Contact Service' },
  { prefix: '/campaigns',         envVar: 'MARKETING_SERVICE_URL',         description: 'Marketing Engine' },
  { prefix: '/agents',            envVar: 'CHATBOT_SERVICE_URL',           description: 'Chatbot Engine' },
  { prefix: '/conversations',     envVar: 'CHATBOT_SERVICE_URL',           description: 'Chatbot Engine (conversations)' },
  { prefix: '/workflows',         envVar: 'AUTOMATION_SERVICE_URL',        description: 'Automation Engine' },
  { prefix: '/calls',             envVar: 'CALL_SERVICE_URL',              description: 'Call Engine' },
  { prefix: '/surveys',           envVar: 'FEEDBACK_SERVICE_URL',          description: 'Feedback Engine' },
  { prefix: '/api-keys',          envVar: 'INTEGRATION_SERVICE_URL',       description: 'Integration Hub (API keys)' },
  { prefix: '/webhooks',          envVar: 'INTEGRATION_SERVICE_URL',       description: 'Integration Hub (webhooks)' },
  { prefix: '/billing',           envVar: 'BILLING_SERVICE_URL',           description: 'Billing Service' },
  { prefix: '/notifications',     envVar: 'NOTIFICATION_SERVICE_URL',      description: 'Notification Service' },
  { prefix: '/reports',           envVar: 'REPORT_SERVICE_URL',            description: 'Report Builder' },
  { prefix: '/attribution',       envVar: 'ATTRIBUTION_SERVICE_URL',       description: 'Attribution Engine' },
  { prefix: '/export',            envVar: 'EXPORT_SERVICE_URL',            description: 'Export Service' },
  { prefix: '/pipelines',         envVar: 'CRM_SERVICE_URL',               description: 'CRM Service (pipelines)' },
  { prefix: '/deals',             envVar: 'CRM_SERVICE_URL',               description: 'CRM Service (deals)' },
  { prefix: '/tasks',             envVar: 'TASK_SERVICE_URL',              description: 'Task Service' },
  { prefix: '/live-chat',         envVar: 'LIVE_CHAT_SERVICE_URL',         description: 'Live Chat Service' },
  { prefix: '/inbox',             envVar: 'TEAM_INBOX_SERVICE_URL',        description: 'Team Inbox Service' },
  { prefix: '/collaboration',     envVar: 'COLLABORATION_SERVICE_URL',     description: 'Collaboration Service' },
  { prefix: '/lead-scores',       envVar: 'LEAD_SCORER_SERVICE_URL',       description: 'Lead Scorer' },
  { prefix: '/predictive',        envVar: 'PREDICTIVE_SERVICE_URL',        description: 'Predictive Analytics Engine' },
  { prefix: '/content',           envVar: 'CONTENT_ASSISTANT_SERVICE_URL', description: 'Content Assistant' },
  { prefix: '/reseller',          envVar: 'RESELLER_SERVICE_URL',          description: 'Reseller / White-Label Service' },
  { prefix: '/marketplace',       envVar: 'MARKETPLACE_SERVICE_URL',       description: 'Marketplace' },
  { prefix: '/portal',            envVar: 'PORTAL_SERVICE_URL',            description: 'Customer Self-Service Portal' },
];

/**
 * Registers proxy route stubs for all downstream services.
 *
 * In production, replace the handler body with an HTTP proxy call to
 * `process.env[route.envVar]`. For example, using @fastify/http-proxy:
 *
 *   await app.register(httpProxy, {
 *     upstream: process.env[route.envVar],
 *     prefix: route.prefix,
 *     rewritePrefix: route.prefix,
 *   });
 */
export function registerProxyRoutes(app: FastifyInstance): void {
  for (const route of SERVICE_ROUTES) {
    const upstreamUrl = process.env[route.envVar];

    app.all(`${route.prefix}/*`, async (request, reply) => {
      if (!upstreamUrl) {
        return reply.status(503).send({
          error: 'Service Unavailable',
          message: `${route.description} is not configured (missing ${route.envVar})`,
        });
      }

      // TODO: replace with real HTTP proxy in production
      // e.g. forward request to `${upstreamUrl}${request.url}`
      return reply.status(503).send({
        error: 'Not Implemented',
        message: `Proxy to ${route.description} at ${upstreamUrl} — wire real proxy here`,
      });
    });

    // Also handle exact prefix (no trailing slash)
    app.all(route.prefix, async (request, reply) => {
      if (!upstreamUrl) {
        return reply.status(503).send({
          error: 'Service Unavailable',
          message: `${route.description} is not configured (missing ${route.envVar})`,
        });
      }
      return reply.status(503).send({
        error: 'Not Implemented',
        message: `Proxy to ${route.description} at ${upstreamUrl} — wire real proxy here`,
      });
    });
  }
}
