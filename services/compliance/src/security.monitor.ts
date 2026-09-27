import { getRedisClient } from '@platform/cache';
import { createPublisher } from '@platform/events';

// Thresholds
const BRUTE_FORCE_THRESHOLD = 10;   // failed logins
const BRUTE_FORCE_WINDOW_SECONDS = 5 * 60; // 5 minutes
const ANOMALOUS_API_THRESHOLD = 500; // requests
const ANOMALOUS_API_WINDOW_SECONDS = 60; // 1 minute

/**
 * Record a failed login attempt for a tenant+email pair.
 * If the count exceeds the brute-force threshold, publish a security event.
 *
 * Returns the current failure count.
 */
export async function recordFailedLogin(
  tenantId: string,
  email: string,
): Promise<number> {
  const redis = getRedisClient();
  const key = `security:brute_force:${tenantId}:${email}`;

  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, BRUTE_FORCE_WINDOW_SECONDS);
  const results = await pipeline.exec();

  const count = (results?.[0]?.[1] as number | undefined) ?? 0;

  if (count >= BRUTE_FORCE_THRESHOLD) {
    await publishBruteForceEvent(tenantId, email, count);
    notifyTenantOwnerStub(tenantId, 'brute_force', {
      email,
      failure_count: count,
      window_minutes: BRUTE_FORCE_WINDOW_SECONDS / 60,
    });
  }

  return count;
}

/**
 * Record an API request from an IP address.
 * If the count exceeds the anomalous threshold, publish a security event.
 *
 * Returns the current request count.
 */
export async function recordApiRequest(
  tenantId: string,
  ip: string,
): Promise<number> {
  const redis = getRedisClient();
  const key = `security:api_rate:${ip}`;

  const pipeline = redis.pipeline();
  pipeline.incr(key);
  pipeline.expire(key, ANOMALOUS_API_WINDOW_SECONDS);
  const results = await pipeline.exec();

  const count = (results?.[0]?.[1] as number | undefined) ?? 0;

  if (count >= ANOMALOUS_API_THRESHOLD) {
    await publishAnomalousApiEvent(tenantId, ip, count);
    notifyTenantOwnerStub(tenantId, 'anomalous_api', {
      ip,
      request_count: count,
      window_seconds: ANOMALOUS_API_WINDOW_SECONDS,
    });
  }

  return count;
}

async function publishBruteForceEvent(
  tenantId: string,
  email: string,
  failureCount: number,
): Promise<void> {
  try {
    const publisher = createPublisher(tenantId);
    await publisher.connect();
    await publisher.publish('security-events', 'security.brute_force', {
      tenant_id: tenantId,
      email,
      failure_count: failureCount,
      window_seconds: BRUTE_FORCE_WINDOW_SECONDS,
    });
    await publisher.disconnect();
  } catch (err) {
    console.error('[security-monitor] Failed to publish brute_force event:', err);
  }
}

async function publishAnomalousApiEvent(
  tenantId: string,
  ip: string,
  requestCount: number,
): Promise<void> {
  try {
    const publisher = createPublisher(tenantId);
    await publisher.connect();
    await publisher.publish('security-events', 'security.anomalous_api', {
      ip,
      request_count: requestCount,
      window_seconds: ANOMALOUS_API_WINDOW_SECONDS,
    });
    await publisher.disconnect();
  } catch (err) {
    console.error('[security-monitor] Failed to publish anomalous_api event:', err);
  }
}

/**
 * Stub: In production, send email alert via Notification Service within 5 minutes.
 */
function notifyTenantOwnerStub(
  tenantId: string,
  eventType: string,
  details: Record<string, unknown>,
): void {
  console.warn(
    `[security-monitor] ALERT tenant=${tenantId} type=${eventType}`,
    JSON.stringify(details),
  );
}
