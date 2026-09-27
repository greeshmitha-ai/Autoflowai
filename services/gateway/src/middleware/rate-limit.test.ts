import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the cache module
vi.mock('@platform/cache', () => ({
  getRedisClient: vi.fn(),
}));

import { getRedisClient } from '@platform/cache';

function makeMockRequest(tenantId?: string): {
  auth?: { tenant_id: string; user_id: string; roles: string[] };
  url: string;
  log: { warn: ReturnType<typeof vi.fn> };
  headers: Record<string, string>;
} {
  const base = {
    url: '/api/contacts',
    headers: {} as Record<string, string>,
    log: { warn: vi.fn() },
  };
  if (tenantId !== undefined) {
    return { ...base, auth: { tenant_id: tenantId, user_id: 'u1', roles: [] as string[] } };
  }
  return base;
}

function makeMockReply(): {
  status: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  header: ReturnType<typeof vi.fn>;
  _statusCode: number;
  _body: unknown;
} {
  const reply = {
    _statusCode: 200,
    _body: null as unknown,
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    header: vi.fn().mockReturnThis(),
  };
  reply.status.mockImplementation((code: number) => {
    reply._statusCode = code;
    return reply;
  });
  reply.send.mockImplementation((body: unknown) => {
    reply._body = body;
    return reply;
  });
  return reply;
}

function makeRedisMock(count: number): ReturnType<typeof vi.fn> {
  return vi.fn().mockReturnValue({
    pipeline: vi.fn().mockReturnValue({
      incr: vi.fn().mockReturnThis(),
      expire: vi.fn().mockReturnThis(),
      exec: vi.fn().mockResolvedValue([[null, count], [null, 1]]),
    }),
  });
}

describe('Rate Limit Middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows requests under the limit', async () => {
    vi.mocked(getRedisClient).mockReturnValue(makeRedisMock(500)() as never);
    const { rateLimitMiddleware } = await import('./rate-limit.js');

    const request = makeMockRequest('tenant-1');
    const reply = makeMockReply();

    await rateLimitMiddleware(request as never, reply as never);

    expect(reply._statusCode).toBe(200); // no 429
    expect(reply.send).not.toHaveBeenCalledWith(expect.objectContaining({ error: 'Too Many Requests' }));
  });

  it('returns 429 when limit is exceeded', async () => {
    vi.mocked(getRedisClient).mockReturnValue(makeRedisMock(1001)() as never);
    const { rateLimitMiddleware } = await import('./rate-limit.js');

    const request = makeMockRequest('tenant-1');
    const reply = makeMockReply();

    await rateLimitMiddleware(request as never, reply as never);

    expect(reply._statusCode).toBe(429);
  });

  it('skips rate limiting when no tenant context', async () => {
    const { rateLimitMiddleware } = await import('./rate-limit.js');

    const request = makeMockRequest(); // no tenantId
    const reply = makeMockReply();

    await rateLimitMiddleware(request as never, reply as never);

    expect(reply._statusCode).toBe(200); // no error
    expect(getRedisClient).not.toHaveBeenCalled();
  });

  it('sets rate limit headers on allowed requests', async () => {
    vi.mocked(getRedisClient).mockReturnValue(makeRedisMock(100)() as never);
    const { rateLimitMiddleware } = await import('./rate-limit.js');

    const request = makeMockRequest('tenant-2');
    const reply = makeMockReply();

    await rateLimitMiddleware(request as never, reply as never);

    expect(reply.header).toHaveBeenCalledWith('X-RateLimit-Limit', '1000');
    expect(reply.header).toHaveBeenCalledWith('X-RateLimit-Remaining', '900');
  });

  it('fails open when Redis is unavailable', async () => {
    vi.mocked(getRedisClient).mockReturnValue({
      pipeline: vi.fn().mockReturnValue({
        incr: vi.fn().mockReturnThis(),
        expire: vi.fn().mockReturnThis(),
        exec: vi.fn().mockRejectedValue(new Error('Redis connection refused')),
      }),
    } as never);
    const { rateLimitMiddleware } = await import('./rate-limit.js');

    const request = makeMockRequest('tenant-3');
    const reply = makeMockReply();

    await rateLimitMiddleware(request as never, reply as never);

    // Should not block the request
    expect(reply._statusCode).toBe(200);
  });
});
