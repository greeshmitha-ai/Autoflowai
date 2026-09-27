import jwt from 'jsonwebtoken';
import { randomUUID } from 'crypto';
import type { JwtPayload } from './types.js';
import type { AuthConfig } from './config.js';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Issue an RS256-signed JWT access token and a random refresh token.
 */
export function issueTokens(
  payload: Omit<JwtPayload, 'exp' | 'iat'>,
  config: AuthConfig,
): TokenPair {
  const accessToken = jwt.sign(
    {
      user_id: payload.user_id,
      tenant_id: payload.tenant_id,
      roles: payload.roles,
    },
    config.jwtPrivateKey,
    {
      algorithm: 'RS256',
      expiresIn: config.accessTokenTtl,
    },
  );

  const refreshToken = randomUUID();

  return {
    accessToken,
    refreshToken,
    expiresIn: config.accessTokenTtl,
  };
}

/**
 * Verify an RS256 JWT and return the decoded payload.
 * Throws if the token is invalid or expired.
 */
export function verifyAccessToken(token: string, publicKey: string): JwtPayload {
  return jwt.verify(token, publicKey, { algorithms: ['RS256'] }) as JwtPayload;
}
