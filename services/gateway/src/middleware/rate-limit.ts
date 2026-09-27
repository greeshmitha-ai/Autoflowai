import type { FastifyRequest, FastifyReply } from 'fastify';
import { getRedisClient } from '@platform/cache';

const RATE_LIMIT = 1000; // requests per minute per tenant
const WINDOW_SECONDS = 60;

/**
 * Rate limiting middleware: 1,000 requests/min per tenant.
 * Uses Redis sliding window counter keyed by tenant_id.
 * Returns HTTP 429 when limit is exceeded.
 */
export async function rateLimitMiddleware(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  // Rate limit is applied after JWT middleware, so auth context is available
  const tenantId = request.auth?.tenant_id;

  if (!tenantId) {
    // No tenant context — skip rate limiting (will be caught by auth middleware)
    return;
  }

  const redis = getRedisClient();
  const key = `ratelimit:${tenantId}:${Math.floor(Date.now() / 1000 / WINDOW_SECONDS)}`;

  try {
    const pipeline = redis.pipeline();
    pipeline.incr(key);
    pipeline.expire(key, WINDOW_SECONDS * 2); // keep for 2 windows
    const results = await pipeline.exec();

    const incrResult = results?.[0];
    if (!incrResult || incrResult[0]) {
      // Redis error — fail open (allow request)
      request.log.warn('Rate limit Redis error, failing open');
      return;
    }

    const currentCount = incrResult[1] as number;

    // Set rate limit headers
    void reply.header('X-RateLimit-Limit', String(RATE_LIMIT));
    void reply.header('X-RateLimit-Remaining', String(Math.max(0, RATE_LIMIT - currentCount)));
    void reply.header('X-RateLimit-Reset', String((Math.floor(Date.now() / 1000 / WINDOW_SECONDS) + 1) * WINDOW_SECONDS));

    if (currentCount > RATE_LIMIT) {
      await reply.status(429).send({
        error: 'Too Many Requests',
        message: `Rate limit exceeded: ${RATE_LIMIT} requests per minute per tenant`,
        retryAfter: WINDOW_SECONDS,
      });
    }
  } catch (err) {
    // Redis unavailable — fail open
    request.log.warn({ err }, 'Rate limit check failed, failing open');
  }
}
