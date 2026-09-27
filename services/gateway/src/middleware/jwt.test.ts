import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateKeyPairSync, createSign } from 'crypto';
import jwt from 'jsonwebtoken';

// Generate a test RS256 key pair
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }) as string;

function makeToken(payload: object, options?: jwt.SignOptions): string {
  return jwt.sign(payload, privateKeyPem, { algorithm: 'RS256', expiresIn: '1h', ...options });
}

function makeMockRequest(headers: Record<string, string> = {}): {
  headers: Record<string, string>;
  auth?: unknown;
  log: { error: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> };
} {
  return {
    headers,
    log: { error: vi.fn(), warn: vi.fn() },
  };
}

function makeMockReply(): {
  status: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  _statusCode: number;
  _body: unknown;
} {
  const reply = {
    _statusCode: 200,
    _body: null as unknown,
    status: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
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

describe('JWT Middleware', () => {
  beforeEach(() => {
    process.env['JWT_PUBLIC_KEY'] = publicKeyPem;
  });

  it('rejects requests with no Authorization header', async () => {
    const { jwtMiddleware } = await import('./jwt.js');
    const request = makeMockRequest();
    const reply = makeMockReply();

    await jwtMiddleware(request as never, reply as never);

    expect(reply._statusCode).toBe(401);
  });

  it('rejects requests with non-Bearer Authorization header', async () => {
    const { jwtMiddleware } = await import('./jwt.js');
    const request = makeMockRequest({ authorization: 'Basic abc123' });
    const reply = makeMockReply();

    await jwtMiddleware(request as never, reply as never);

    expect(reply._statusCode).toBe(401);
  });

  it('rejects expired tokens', async () => {
    const { jwtMiddleware } = await import('./jwt.js');
    const token = makeToken(
      { user_id: 'u1', tenant_id: 't1', roles: ['member'] },
      { expiresIn: -1 }, // already expired
    );
    const request = makeMockRequest({ authorization: `Bearer ${token}` });
    const reply = makeMockReply();

    await jwtMiddleware(request as never, reply as never);

    expect(reply._statusCode).toBe(401);
    expect((reply._body as { message: string }).message).toContain('expired');
  });

  it('rejects tokens signed with wrong algorithm', async () => {
    const { jwtMiddleware } = await import('./jwt.js');
    // Sign with HS256 instead of RS256
    const token = jwt.sign(
      { user_id: 'u1', tenant_id: 't1', roles: ['member'] },
      'secret',
      { algorithm: 'HS256' },
    );
    const request = makeMockRequest({ authorization: `Bearer ${token}` });
    const reply = makeMockReply();

    await jwtMiddleware(request as never, reply as never);

    expect(reply._statusCode).toBe(401);
  });

  it('accepts valid RS256 token and injects auth context', async () => {
    const { jwtMiddleware } = await import('./jwt.js');
    const token = makeToken({ user_id: 'user-123', tenant_id: 'tenant-456', roles: ['admin', 'member'] });
    const request = makeMockRequest({ authorization: `Bearer ${token}` });
    const reply = makeMockReply();

    await jwtMiddleware(request as never, reply as never);

    expect(reply._statusCode).toBe(200); // no error response
    expect((request as { auth?: { user_id: string; tenant_id: string; roles: string[] } }).auth).toEqual({
      user_id: 'user-123',
      tenant_id: 'tenant-456',
      roles: ['admin', 'member'],
    });
  });

  it('rejects tokens missing required claims', async () => {
    const { jwtMiddleware } = await import('./jwt.js');
    // Token without tenant_id
    const token = makeToken({ user_id: 'user-123', roles: ['member'] });
    const request = makeMockRequest({ authorization: `Bearer ${token}` });
    const reply = makeMockReply();

    await jwtMiddleware(request as never, reply as never);

    expect(reply._statusCode).toBe(401);
  });
});
