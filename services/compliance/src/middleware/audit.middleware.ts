import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { getDb, auditLogs } from '@platform/db';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Derives a resource_type from the request URL.
 * e.g. /contacts/123 → "contacts", /tenants/abc/export → "tenants"
 */
function deriveResourceType(url: string): string {
  const path = url.split('?')[0] ?? '';
  const segments = path.split('/').filter(Boolean);
  return segments[0] ?? 'unknown';
}

/**
 * Derives the action from the HTTP method.
 */
function deriveAction(method: string): string {
  switch (method.toUpperCase()) {
    case 'POST':
      return 'create';
    case 'PUT':
    case 'PATCH':
      return 'update';
    case 'DELETE':
      return 'delete';
    default:
      return method.toLowerCase();
  }
}

/**
 * Fastify hook that records every mutating request (POST/PUT/PATCH/DELETE)
 * to the audit_logs table.
 *
 * Exported so other services can register it in their own Fastify instances.
 */
export async function auditHook(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) return;

  const tenantId = request.auth?.tenant_id;
  const userId = request.auth?.user_id;

  // Only audit authenticated requests
  if (!tenantId) return;

  const resourceType = deriveResourceType(request.url);
  const action = deriveAction(request.method);

  try {
    const db = getDb();
    await db.insert(auditLogs).values({
      tenant_id: tenantId,
      ...(userId ? { user_id: userId } : {}),
      resource_type: resourceType,
      action,
      timestamp: new Date(),
      metadata: {
        method: request.method,
        url: request.url,
        ip: request.ip,
      },
    });
  } catch (err) {
    // Audit failures must not block the request
    request.log.error({ err }, 'Failed to write audit log');
  }
}

/**
 * Register the audit hook on a Fastify instance.
 * Call this in any service that needs audit logging.
 */
export function registerAuditMiddleware(app: FastifyInstance): void {
  app.addHook('onSend', async (request, reply) => {
    // Only audit after the response is sent to avoid blocking
    void auditHook(request, reply);
  });
}
