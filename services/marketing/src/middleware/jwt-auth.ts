import type { FastifyRequest, FastifyReply } from 'fastify';
import { createVerify } from 'crypto';

interface JwtPayload {
  user_id: string;
  tenant_id: string;
  roles: string[];
  exp: number;
  iat: number;
}

function base64UrlDecode(str: string): string {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function verifyJwt(token: string, publicKey: string): JwtPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWT format');

  const [headerB64, payloadB64, signatureB64] = parts as [string, string, string];

  const header = JSON.parse(base64UrlDecode(headerB64)) as { alg: string };
  if (header.alg !== 'RS256') throw new Error('Unsupported algorithm');

  const verify = createVerify('RSA-SHA256');
  verify.update(`${headerB64}.${payloadB64}`);
  const signatureBuffer = Buffer.from(
    signatureB64.replace(/-/g, '+').replace(/_/g, '/'),
    'base64',
  );
  const valid = verify.verify(publicKey, signatureBuffer);
  if (!valid) throw new Error('Invalid JWT signature');

  const payload = JSON.parse(base64UrlDecode(payloadB64)) as JwtPayload;

  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token expired');
  }

  return payload;
}

export function createJwtAuthMiddleware(jwtPublicKey: string) {
  return async function jwtAuthMiddleware(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      await reply.status(401).send({ error: 'Unauthorized', message: 'Missing Authorization header' });
      return;
    }

    const token = authHeader.slice(7);

    try {
      const payload = verifyJwt(token, jwtPublicKey);

      if (!payload.user_id || !payload.tenant_id || !Array.isArray(payload.roles)) {
        await reply.status(401).send({ error: 'Unauthorized', message: 'Invalid token claims' });
        return;
      }

      request.auth = {
        user_id: payload.user_id,
        tenant_id: payload.tenant_id,
        roles: payload.roles,
      };
    } catch {
      await reply.status(401).send({ error: 'Unauthorized', message: 'Invalid or expired token' });
    }
  };
}
