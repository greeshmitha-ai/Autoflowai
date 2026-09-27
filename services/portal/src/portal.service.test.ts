/**
 * Portal Service tests — Requirements 26.1–26.7
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  sendMagicLink,
  verifyMagicLink,
  portalPasswordLogin,
  getContactHistory,
  createSupportTicket,
  listSupportTickets,
  getPreferences,
  updatePreferences,
  requestDataExport,
  ValidationError,
  NotFoundError,
  AuthError,
} from './portal.service.js';

// ─── DB mock ──────────────────────────────────────────────────────────────────

const mockContact = {
  contact_id: 'contact-uuid-1',
  tenant_id: 'tenant-uuid-1',
  email: 'alice@example.com',
  full_name: 'Alice',
  tags: [] as string[],
  lead_score: 50,
  lead_score_confidence: 'low' as const,
  phone: null,
  company_name: null,
  lifecycle_stage: null,
  pii_erasure_requested_at: null,
  created_at: new Date('2024-01-01'),
  updated_at: new Date('2024-01-01'),
};

const mockSession = {
  session_id: 'session-uuid-1',
  tenant_id: 'tenant-uuid-1',
  contact_id: 'contact-uuid-1',
  email: 'alice@example.com',
  magic_link_token: 'abc123token',
  token_expires_at: new Date(Date.now() + 15 * 60 * 1000),
  created_at: new Date(),
};

const mockTicket = {
  ticket_id: 'ticket-uuid-1',
  tenant_id: 'tenant-uuid-1',
  contact_id: 'contact-uuid-1',
  subject: 'Test issue',
  description: 'Something is broken',
  status: 'open' as const,
  file_attachment_url: null,
  ticket_ref: 'TKT-ABC-123',
  created_at: new Date(),
};

// Mock @platform/db
vi.mock('@platform/db', () => {
  const selectChain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
  };

  const insertChain = {
    values: vi.fn().mockReturnThis(),
    returning: vi.fn(),
  };

  const updateChain = {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    returning: vi.fn(),
  };

  const mockDb = {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
    update: vi.fn(() => updateChain),
  };

  return {
    getDb: vi.fn(() => mockDb),
    portalSessions: { session_id: 'session_id', magic_link_token: 'magic_link_token' },
    supportTickets: { ticket_id: 'ticket_id', tenant_id: 'tenant_id', contact_id: 'contact_id' },
    contacts: { contact_id: 'contact_id', tenant_id: 'tenant_id', email: 'email', tags: 'tags' },
    campaignDeliveries: { delivery_id: 'delivery_id', tenant_id: 'tenant_id', contact_id: 'contact_id', created_at: 'created_at' },
    calls: { call_id: 'call_id', tenant_id: 'tenant_id', contact_id: 'contact_id', created_at: 'created_at' },
    conversations: { conversation_id: 'conversation_id', tenant_id: 'tenant_id', contact_id: 'contact_id', created_at: 'created_at' },
    surveyResponses: { response_id: 'response_id', tenant_id: 'tenant_id', contact_id: 'contact_id', submitted_at: 'submitted_at' },
    eq: vi.fn((a, b) => ({ eq: [a, b] })),
    and: vi.fn((...args) => ({ and: args })),
    desc: vi.fn((col) => ({ desc: col })),
    isNull: vi.fn((col) => ({ isNull: col })),
  };
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Portal Auth — sendMagicLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws ValidationError when email is empty', async () => {
    await expect(sendMagicLink('tenant-1', '')).rejects.toThrow(ValidationError);
  });

  it('returns NotFoundError when contact does not exist', async () => {
    const { getDb } = await import('@platform/db');
    const db = getDb() as ReturnType<typeof getDb> & { select: ReturnType<typeof vi.fn> };
    // Simulate no contact found
    (db.select().from({} as never).where({} as never).limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    await expect(sendMagicLink('tenant-1', 'unknown@example.com')).rejects.toThrow(NotFoundError);
  });

  it('creates a session and returns a token when contact exists', async () => {
    const { getDb } = await import('@platform/db');
    const db = getDb() as ReturnType<typeof getDb> & { select: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };

    (db.select().from({} as never).where({} as never).limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockContact]);
    (db.insert({} as never).values({} as never).returning as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockSession]);

    const result = await sendMagicLink('tenant-uuid-1', 'alice@example.com');
    expect(result.token).toBeTruthy();
    expect(result.session_id).toBe('session-uuid-1');
  });
});

describe('Portal Auth — verifyMagicLink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws ValidationError when token is empty', async () => {
    await expect(verifyMagicLink('')).rejects.toThrow(ValidationError);
  });

  it('throws AuthError when token not found', async () => {
    const { getDb } = await import('@platform/db');
    const db = getDb() as ReturnType<typeof getDb> & { select: ReturnType<typeof vi.fn> };
    (db.select().from({} as never).where({} as never).limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    await expect(verifyMagicLink('invalid-token')).rejects.toThrow(AuthError);
  });

  it('throws AuthError when token is expired', async () => {
    const { getDb } = await import('@platform/db');
    const db = getDb() as ReturnType<typeof getDb> & { select: ReturnType<typeof vi.fn> };
    const expiredSession = { ...mockSession, token_expires_at: new Date(Date.now() - 1000) };
    (db.select().from({} as never).where({} as never).limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([expiredSession]);

    await expect(verifyMagicLink('expired-token')).rejects.toThrow(AuthError);
  });

  it('returns session info and invalidates token on valid token', async () => {
    const { getDb } = await import('@platform/db');
    const db = getDb() as ReturnType<typeof getDb> & { select: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    (db.select().from({} as never).where({} as never).limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockSession]);
    (db.update({} as never).set({} as never).where as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await verifyMagicLink('abc123token');
    expect(result.contact_id).toBe('contact-uuid-1');
    expect(result.tenant_id).toBe('tenant-uuid-1');
    expect(result.email).toBe('alice@example.com');
  });
});

describe('Portal Auth — portalPasswordLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws ValidationError when email is empty', async () => {
    await expect(portalPasswordLogin('tenant-1', '', 'pass')).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when password is empty', async () => {
    await expect(portalPasswordLogin('tenant-1', 'a@b.com', '')).rejects.toThrow(ValidationError);
  });

  it('throws AuthError when contact not found', async () => {
    const { getDb } = await import('@platform/db');
    const db = getDb() as ReturnType<typeof getDb> & { select: ReturnType<typeof vi.fn> };
    (db.select().from({} as never).where({} as never).limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    await expect(portalPasswordLogin('tenant-1', 'x@y.com', 'pass')).rejects.toThrow(AuthError);
  });

  it('returns session info when contact exists', async () => {
    const { getDb } = await import('@platform/db');
    const db = getDb() as ReturnType<typeof getDb> & { select: ReturnType<typeof vi.fn>; insert: ReturnType<typeof vi.fn> };
    (db.select().from({} as never).where({} as never).limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockContact]);
    (db.insert({} as never).values({} as never).returning as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockSession]);

    const result = await portalPasswordLogin('tenant-uuid-1', 'alice@example.com', 'password123');
    expect(result.contact_id).toBe('contact-uuid-1');
    expect(result.email).toBe('alice@example.com');
  });
});

describe('Support Tickets', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws ValidationError when subject is empty', async () => {
    await expect(
      createSupportTicket('t1', 'c1', { subject: '', description: 'desc' }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when description is empty', async () => {
    await expect(
      createSupportTicket('t1', 'c1', { subject: 'sub', description: '' }),
    ).rejects.toThrow(ValidationError);
  });

  it('creates a ticket with a unique ticket_ref', async () => {
    const { getDb } = await import('@platform/db');
    const db = getDb() as ReturnType<typeof getDb> & { insert: ReturnType<typeof vi.fn> };
    (db.insert({} as never).values({} as never).returning as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockTicket]);

    const ticket = await createSupportTicket('tenant-uuid-1', 'contact-uuid-1', {
      subject: 'Test issue',
      description: 'Something is broken',
    });

    expect(ticket.ticket_ref).toMatch(/^TKT-/);
    expect(ticket.status).toBe('open');
  });

  it('lists tickets for a contact', async () => {
    const { getDb } = await import('@platform/db');
    const db = getDb() as ReturnType<typeof getDb> & { select: ReturnType<typeof vi.fn> };
    (db.select().from({} as never).where({} as never).orderBy as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockTicket]);

    const tickets = await listSupportTickets('tenant-uuid-1', 'contact-uuid-1');
    expect(tickets).toHaveLength(1);
    expect(tickets[0]?.ticket_ref).toBe('TKT-ABC-123');
  });
});

describe('Communication Preferences', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns all opt-in when no opt-out tags present', async () => {
    const { getDb } = await import('@platform/db');
    const db = getDb() as ReturnType<typeof getDb> & { select: ReturnType<typeof vi.fn> };
    (db.select().from({} as never).where({} as never).limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockContact]);

    const prefs = await getPreferences('tenant-uuid-1', 'contact-uuid-1');
    expect(prefs.email_opt_in).toBe(true);
    expect(prefs.sms_opt_in).toBe(true);
    expect(prefs.in_app_opt_in).toBe(true);
  });

  it('returns opt-out when tags include opt_out_email', async () => {
    const { getDb } = await import('@platform/db');
    const db = getDb() as ReturnType<typeof getDb> & { select: ReturnType<typeof vi.fn> };
    const contactWithOptOut = { ...mockContact, tags: ['opt_out_email'] };
    (db.select().from({} as never).where({} as never).limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([contactWithOptOut]);

    const prefs = await getPreferences('tenant-uuid-1', 'contact-uuid-1');
    expect(prefs.email_opt_in).toBe(false);
    expect(prefs.sms_opt_in).toBe(true);
  });

  it('updates preferences and applies to contact record', async () => {
    const { getDb } = await import('@platform/db');
    const db = getDb() as ReturnType<typeof getDb> & { select: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
    (db.select().from({} as never).where({} as never).limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockContact]);
    (db.update({} as never).set({} as never).where as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    const result = await updatePreferences('tenant-uuid-1', 'contact-uuid-1', {
      email_opt_in: false,
      sms_opt_in: true,
      in_app_opt_in: true,
    });

    expect(result.email_opt_in).toBe(false);
    expect(result.sms_opt_in).toBe(true);
  });

  it('throws NotFoundError when contact does not exist', async () => {
    const { getDb } = await import('@platform/db');
    const db = getDb() as ReturnType<typeof getDb> & { select: ReturnType<typeof vi.fn> };
    (db.select().from({} as never).where({} as never).limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    await expect(getPreferences('tenant-1', 'no-contact')).rejects.toThrow(NotFoundError);
  });
});

describe('Data Export Request', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns confirmation message with estimated completion', async () => {
    const { getDb } = await import('@platform/db');
    const db = getDb() as ReturnType<typeof getDb> & { select: ReturnType<typeof vi.fn> };
    (db.select().from({} as never).where({} as never).limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([mockContact]);

    const result = await requestDataExport('tenant-uuid-1', 'contact-uuid-1');
    expect(result.message).toContain('data export request');
    expect(result.estimated_completion).toBeTruthy();

    // Estimated completion should be ~48 hours from now
    const estimated = new Date(result.estimated_completion);
    const hoursFromNow = (estimated.getTime() - Date.now()) / (1000 * 60 * 60);
    expect(hoursFromNow).toBeGreaterThan(47);
    expect(hoursFromNow).toBeLessThan(49);
  });

  it('throws NotFoundError when contact does not exist', async () => {
    const { getDb } = await import('@platform/db');
    const db = getDb() as ReturnType<typeof getDb> & { select: ReturnType<typeof vi.fn> };
    (db.select().from({} as never).where({} as never).limit as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);

    await expect(requestDataExport('tenant-1', 'no-contact')).rejects.toThrow(NotFoundError);
  });
});
