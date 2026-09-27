import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSession,
  getSession,
  assignOperator,
  closeSession,
  addMessage,
  createCannedResponse,
  listCannedResponses,
  NotFoundError,
  ValidationError,
} from './live-chat.service.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@platform/db', () => {
  const liveChatSessions = {
    session_id: 'session_id',
    tenant_id: 'tenant_id',
    status: 'status',
    conversation_id: 'conversation_id',
    contact_id: 'contact_id',
    assigned_operator_id: 'assigned_operator_id',
    closed_at: 'closed_at',
  };
  const liveChatMessages = {
    message_id: 'message_id',
    session_id: 'session_id',
    tenant_id: 'tenant_id',
    sender_type: 'sender_type',
    sender_id: 'sender_id',
    content: 'content',
    sent_at: 'sent_at',
  };
  const cannedResponses = {
    canned_response_id: 'canned_response_id',
    tenant_id: 'tenant_id',
    title: 'title',
    content: 'content',
    created_by: 'created_by',
  };
  const conversations = { conversation_id: 'conversation_id', transcript: 'transcript' };
  const contacts = {
    contact_id: 'contact_id',
    full_name: 'full_name',
    email: 'email',
    phone: 'phone',
    company_name: 'company_name',
    lead_score: 'lead_score',
    lead_score_confidence: 'lead_score_confidence',
    lifecycle_stage: 'lifecycle_stage',
    tags: 'tags',
  };

  return {
    getDb: vi.fn(),
    liveChatSessions,
    liveChatMessages,
    cannedResponses,
    conversations,
    contacts,
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val, op: 'eq' })),
  and: vi.fn((...args) => ({ args, op: 'and' })),
  asc: vi.fn((col) => ({ col, dir: 'asc' })),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    session_id: 'session-1',
    tenant_id: 'tenant-1',
    conversation_id: null,
    contact_id: null,
    assigned_operator_id: null,
    status: 'waiting',
    created_at: new Date(),
    closed_at: null,
    ...overrides,
  };
}

function makeMessage(overrides: Record<string, unknown> = {}) {
  return {
    message_id: 'msg-1',
    session_id: 'session-1',
    tenant_id: 'tenant-1',
    sender_type: 'operator',
    sender_id: 'op-1',
    content: 'Hello',
    sent_at: new Date(),
    ...overrides,
  };
}

// ─── createSession ────────────────────────────────────────────────────────────

describe('createSession', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('creates a session with waiting status', async () => {
    const fakeSession = makeSession();
    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([fakeSession]),
        }),
      }),
    } as never);

    const result = await createSession('tenant-1', {});
    expect(result.status).toBe('waiting');
    expect(result.assigned_operator_id).toBeNull();
  });

  it('creates a session with conversation_id and contact_id', async () => {
    const fakeSession = makeSession({ conversation_id: 'conv-1', contact_id: 'contact-1' });
    const { getDb } = await import('@platform/db');
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([fakeSession]),
    });
    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn().mockReturnValue({ values: mockValues }),
    } as never);

    const result = await createSession('tenant-1', {
      conversation_id: 'conv-1',
      contact_id: 'contact-1',
    });
    expect(result.conversation_id).toBe('conv-1');
    expect(result.contact_id).toBe('contact-1');
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        conversation_id: 'conv-1',
        contact_id: 'contact-1',
        status: 'waiting',
      }),
    );
  });
});

// ─── getSession ───────────────────────────────────────────────────────────────

describe('getSession', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws NotFoundError when session does not exist', async () => {
    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as never);

    await expect(getSession('tenant-1', 'nonexistent')).rejects.toThrow(NotFoundError);
  });

  it('returns session when found', async () => {
    const fakeSession = makeSession();
    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([fakeSession]),
          }),
        }),
      }),
    } as never);

    const result = await getSession('tenant-1', 'session-1');
    expect(result.session_id).toBe('session-1');
  });
});

// ─── assignOperator ───────────────────────────────────────────────────────────

describe('assignOperator', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws ValidationError when session is not in waiting state', async () => {
    const activeSession = makeSession({ status: 'active' });
    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([activeSession]),
          }),
        }),
      }),
    } as never);

    await expect(assignOperator('tenant-1', 'session-1', 'op-1')).rejects.toThrow(ValidationError);
  });

  it('assigns operator and sets status to active', async () => {
    const waitingSession = makeSession({ status: 'waiting' });
    const assignedSession = makeSession({ status: 'active', assigned_operator_id: 'op-1' });

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([waitingSession]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([assignedSession]),
          }),
        }),
      }),
    } as never);

    const result = await assignOperator('tenant-1', 'session-1', 'op-1');
    expect(result.status).toBe('active');
    expect(result.assigned_operator_id).toBe('op-1');
  });

  it('throws ValidationError when session already assigned (concurrent accept)', async () => {
    const waitingSession = makeSession({ status: 'waiting' });

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([waitingSession]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            // Returns empty — another operator got there first
            returning: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as never);

    await expect(assignOperator('tenant-1', 'session-1', 'op-2')).rejects.toThrow(ValidationError);
  });
});

// ─── closeSession ─────────────────────────────────────────────────────────────

describe('closeSession', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws NotFoundError when session does not exist', async () => {
    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as never);

    await expect(closeSession('tenant-1', 'nonexistent')).rejects.toThrow(NotFoundError);
  });

  it('closes session and sets closed_at', async () => {
    const session = makeSession({ status: 'active' });
    const closedSession = makeSession({ status: 'closed', closed_at: new Date() });

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([session]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([closedSession]),
          }),
        }),
      }),
    } as never);

    const result = await closeSession('tenant-1', 'session-1');
    expect(result.status).toBe('closed');
    expect(result.closed_at).not.toBeNull();
  });
});

// ─── addMessage ───────────────────────────────────────────────────────────────

describe('addMessage', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws ValidationError when content is empty', async () => {
    await expect(
      addMessage('tenant-1', 'session-1', 'operator', 'op-1', ''),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when content is whitespace only', async () => {
    await expect(
      addMessage('tenant-1', 'session-1', 'operator', 'op-1', '   '),
    ).rejects.toThrow(ValidationError);
  });

  it('stores message and returns it', async () => {
    const session = makeSession();
    const fakeMsg = makeMessage({ content: 'Hello customer' });

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([session]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([fakeMsg]),
        }),
      }),
    } as never);

    const result = await addMessage('tenant-1', 'session-1', 'operator', 'op-1', 'Hello customer');
    expect(result.content).toBe('Hello customer');
    expect(result.sender_type).toBe('operator');
  });

  it('trims whitespace from content', async () => {
    const session = makeSession();
    const fakeMsg = makeMessage({ content: 'Trimmed' });

    const { getDb } = await import('@platform/db');
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([fakeMsg]),
    });
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([session]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({ values: mockValues }),
    } as never);

    await addMessage('tenant-1', 'session-1', 'customer', 'cust-1', '  Trimmed  ');
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Trimmed' }),
    );
  });
});

// ─── createCannedResponse ─────────────────────────────────────────────────────

describe('createCannedResponse', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws ValidationError when title is empty', async () => {
    await expect(
      createCannedResponse('tenant-1', 'user-1', { title: '', content: 'Some content' }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when content is empty', async () => {
    await expect(
      createCannedResponse('tenant-1', 'user-1', { title: 'My Template', content: '' }),
    ).rejects.toThrow(ValidationError);
  });

  it('creates canned response successfully', async () => {
    const fakeCanned = {
      canned_response_id: 'cr-1',
      tenant_id: 'tenant-1',
      title: 'Greeting',
      content: 'Hello! How can I help you today?',
      created_by: 'user-1',
      created_at: new Date(),
    };

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([fakeCanned]),
        }),
      }),
    } as never);

    const result = await createCannedResponse('tenant-1', 'user-1', {
      title: 'Greeting',
      content: 'Hello! How can I help you today?',
    });
    expect(result.title).toBe('Greeting');
    expect(result.content).toBe('Hello! How can I help you today?');
  });
});

// ─── listCannedResponses ──────────────────────────────────────────────────────

describe('listCannedResponses', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns empty array when no canned responses exist', async () => {
    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
    } as never);

    const result = await listCannedResponses('tenant-1');
    expect(result).toEqual([]);
  });

  it('returns list of canned responses for tenant', async () => {
    const fakeCanned = [
      { canned_response_id: 'cr-1', tenant_id: 'tenant-1', title: 'A', content: 'Content A', created_by: 'u1', created_at: new Date() },
      { canned_response_id: 'cr-2', tenant_id: 'tenant-1', title: 'B', content: 'Content B', created_by: 'u1', created_at: new Date() },
    ];

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(fakeCanned),
          }),
        }),
      }),
    } as never);

    const result = await listCannedResponses('tenant-1');
    expect(result).toHaveLength(2);
    expect(result[0]!.title).toBe('A');
  });
});
