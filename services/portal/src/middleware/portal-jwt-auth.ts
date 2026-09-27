import type { FastifyRequest, FastifyReply } from 'fastify';
import { createHmac, timingSafeEqual } from 'crypto';

export interface PortalTokenPayload {
  contact_id: string;
  tenant_id: string;
  email: string;
  session_id: string;
  exp: number;
  iat: number;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

function base64UrlDecode(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

/**
 * Sign a portal JWT using HMAC-SHA256 (HS256).
 * Portal tokens use contact_id instead of user_id.
 */
export function signPortalJwt(payload: Omit<PortalTokenPayload, 'iat'>, secret: string): string {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64UrlEncode(JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000) }));
  const signingInput = `${header}.${body}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
}

/**
 * Verify a portal JWT signed with HMAC-SHA256.
 */
export function verifyPortalJwt(token: string, secret: string): PortalTokenPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  const signingInput = `${headerB64}.${payloadB64}`;
  const expectedSig = createHmac('sha256', secret).update(signingInput).digest('base64url');

  const sigBuf = Buffer.from(signatureB64, 'base64url');
  const expBuf = Buffer.from(expectedSig, 'base64url');

  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Invalid JWT signature');
  }

  const payload = JSON.parse(base64UrlDecode(payloadB64)) as PortalTokenPayload;

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  return payload;
}

export function createPortalJwtMiddleware(jwtSecret: string) {
  return async function portalJwtMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      await reply.status(401).send({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header',
      });
      return;
    }

    const token = authHeader.slice(7);

    try {
      const payload = verifyPortalJwt(token, jwtSecret);

      if (!payload.contact_id || !payload.tenant_id) {
        await reply.status(401).send({ error: 'Unauthorized', message: 'Invalid token claims' });
        return;
      }

      request.portalAuth = {
        contact_id: payload.contact_id,
        tenant_id: payload.tenant_id,
        email: payload.email,
        session_id: payload.session_id,
      };
    } catch {
      await reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }
  };
}
