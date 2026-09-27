/**
 * Auth service configuration loaded from environment variables.
 */
export interface AuthConfig {
  /** RS256 private key (PEM format) for signing JWTs */
  jwtPrivateKey: string;
  /** RS256 public key (PEM format) for verifying JWTs */
  jwtPublicKey: string;
  /** Access token TTL in seconds (minimum 900 = 15 minutes) */
  accessTokenTtl: number;
  /** Refresh token TTL in seconds (default 30 days) */
  refreshTokenTtl: number;
  /** bcrypt cost factor (minimum 12) */
  bcryptCostFactor: number;
  /** Max failed login attempts before lockout */
  maxFailedAttempts: number;
  /** Lockout duration in seconds */
  lockoutTtl: number;
  /** HTTP port */
  port: number;
  /** HTTP host */
  host: string;
}

export function loadConfig(): AuthConfig {
  const jwtPrivateKey = process.env['JWT_PRIVATE_KEY'] ?? '';
  const jwtPublicKey = process.env['JWT_PUBLIC_KEY'] ?? '';

  if (!jwtPrivateKey || !jwtPublicKey) {
    // In test/dev environments, keys may be generated on the fly
    // In production, these MUST be set
    if (process.env['NODE_ENV'] === 'production') {
      throw new Error('JWT_PRIVATE_KEY and JWT_PUBLIC_KEY must be set in production');
    }
  }

  const accessTokenTtl = parseInt(process.env['ACCESS_TOKEN_TTL'] ?? '900', 10);
  if (accessTokenTtl < 900) {
    throw new Error('ACCESS_TOKEN_TTL must be at least 900 seconds (15 minutes)');
  }

  const bcryptCostFactor = parseInt(process.env['BCRYPT_COST_FACTOR'] ?? '12', 10);
  if (bcryptCostFactor < 12) {
    throw new Error('BCRYPT_COST_FACTOR must be at least 12');
  }

  return {
    jwtPrivateKey,
    jwtPublicKey,
    accessTokenTtl,
    refreshTokenTtl: parseInt(process.env['REFRESH_TOKEN_TTL'] ?? String(30 * 24 * 3600), 10),
    bcryptCostFactor,
    maxFailedAttempts: parseInt(process.env['MAX_FAILED_ATTEMPTS'] ?? '3', 10),
    lockoutTtl: parseInt(process.env['LOCKOUT_TTL'] ?? '900', 10),
    port: parseInt(process.env['PORT'] ?? '3001', 10),
    host: process.env['HOST'] ?? '0.0.0.0',
  };
}
