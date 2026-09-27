import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createInboxConversation,
  getInboxConversation,
  listInboxConversations,
  assignConversation,
  updateConversationStatus,
  touchConversation,
  NotFoundError,
  ValidationError,
} from './inbox.service.js';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@platform/db', () => {
  const inboxConversations = {
    inbox_id: 'inbox_id',
    tenant_id: 'tenant_id',
    channel: 'channel',
    contact_id: 'contact_id',
    contact_name: 'contact_name',
    last_message_preview: 'last_message_preview',
    last_message_at: 'last_message_at',
    assigned_to: 'assigned_to',
    status: 'status',
    created_at: 'created_at',
  };

  return {
    getDb: vi.fn(),
    inboxConversations,
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val, op: 'eq' })),
  and: vi.fn((...args) => ({ args, op: 'and' })),
  asc: vi.fn((col) => ({ col, dir: 'asc' })),
  desc: vi.fn((col) => ({ col, dir: 'desc' })),
  ilike: vi.fn((col, val) => ({ col, val, op: 'ilike' })),
  gte: vi.fn((col, val) => ({ col, val, op: 'gte' })),
  lte: vi.fn((col, val) => ({ col, val, op: 'lte' })),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConversation(overrides: Record<string, unknown> = {}) {
  return {
    inbox_id: 'inbox-1',
    tenant_id: 'tenant-1',
    channel: 'email',
    contact_id: null,
    contact_name: 'Alice',
    last_message_preview: 'Hello',
    last_message_at: new Date(),
    assigned_to: null,
    status: 'open',
    created_at: new Date(),
    ...overrides,
  };
}

// ─── createInboxConversation ──────────────────────────────────────────────────

describe('createInboxConversation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws ValidationError when channel is missing', async () => {
    await expect(
      createInboxConversation('tenant-1', { channel: '' as never }),
    ).rejects.toThrow(ValidationError);
  });

  it('creates a conversation with open status', async () => {
    const fakeConv = makeConversation();
    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([fakeConv]),
        }),
      }),
    } as never);

    const result = await createInboxConversation('tenant-1', { channel: 'email' });
    expect(result.status).toBe('open');
    expect(result.channel).toBe('email');
  });

  it('creates a conversation with contact_id and preview', async () => {
    const fakeConv = makeConversation({ contact_id: 'contact-1', last_message_preview: 'Hi there' });
    const { getDb } = await import('@platform/db');
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([fakeConv]),
    });
    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn().mockReturnValue({ values: mockValues }),
    } as never);

    const result = await createInboxConversation('tenant-1', {
      channel: 'sms',
      contact_id: 'contact-1',
      last_message_preview: 'Hi there',
    });
    expect(result.contact_id).toBe('contact-1');
    expect(result.last_message_preview).toBe('Hi there');
    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'sms',
        contact_id: 'contact-1',
        status: 'open',
      }),
    );
  });
});

// ─── getInboxConversation ─────────────────────────────────────────────────────

describe('getInboxConversation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws NotFoundError when conversation does not exist', async () => {
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

    await expect(getInboxConversation('tenant-1', 'nonexistent')).rejects.toThrow(NotFoundError);
  });

  it('returns conversation when found', async () => {
    const fakeConv = makeConversation();
    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([fakeConv]),
          }),
        }),
      }),
    } as never);

    const result = await getInboxConversation('tenant-1', 'inbox-1');
    expect(result.inbox_id).toBe('inbox-1');
  });
});

// ─── listInboxConversations ───────────────────────────────────────────────────

describe('listInboxConversations', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns empty array when no conversations exist', async () => {
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

    const result = await listInboxConversations('tenant-1', {});
    expect(result).toEqual([]);
  });

  it('returns conversations for tenant', async () => {
    const fakeConvs = [makeConversation(), makeConversation({ inbox_id: 'inbox-2' })];
    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(fakeConvs),
          }),
        }),
      }),
    } as never);

    const result = await listInboxConversations('tenant-1', {});
    expect(result).toHaveLength(2);
  });
});

// ─── assignConversation ───────────────────────────────────────────────────────

describe('assignConversation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws ValidationError when user_id is empty', async () => {
    await expect(
      assignConversation('tenant-1', 'inbox-1', ''),
    ).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError when conversation does not exist', async () => {
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

    await expect(assignConversation('tenant-1', 'nonexistent', 'user-1')).rejects.toThrow(NotFoundError);
  });

  it('assigns conversation to user', async () => {
    const fakeConv = makeConversation();
    const assignedConv = makeConversation({ assigned_to: 'user-1' });

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([fakeConv]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([assignedConv]),
          }),
        }),
      }),
    } as never);

    const result = await assignConversation('tenant-1', 'inbox-1', 'user-1');
    expect(result.assigned_to).toBe('user-1');
  });
});

// ─── updateConversationStatus ─────────────────────────────────────────────────

describe('updateConversationStatus', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('throws ValidationError for invalid status', async () => {
    await expect(
      updateConversationStatus('tenant-1', 'inbox-1', 'invalid' as never),
    ).rejects.toThrow(ValidationError);
  });

  it('throws NotFoundError when conversation does not exist', async () => {
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

    await expect(
      updateConversationStatus('tenant-1', 'nonexistent', 'resolved'),
    ).rejects.toThrow(NotFoundError);
  });

  it('updates status to resolved', async () => {
    const fakeConv = makeConversation();
    const resolvedConv = makeConversation({ status: 'resolved' });

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([fakeConv]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([resolvedConv]),
          }),
        }),
      }),
    } as never);

    const result = await updateConversationStatus('tenant-1', 'inbox-1', 'resolved');
    expect(result.status).toBe('resolved');
  });

  it('accepts all valid statuses', async () => {
    const statuses = ['open', 'pending', 'resolved', 'snoozed'] as const;
    for (const status of statuses) {
      const fakeConv = makeConversation();
      const updatedConv = makeConversation({ status });

      const { getDb } = await import('@platform/db');
      vi.mocked(getDb).mockReturnValue({
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([fakeConv]),
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              returning: vi.fn().mockResolvedValue([updatedConv]),
            }),
          }),
        }),
      } as never);

      const result = await updateConversationStatus('tenant-1', 'inbox-1', status);
      expect(result.status).toBe(status);
    }
  });
});

// ─── touchConversation ────────────────────────────────────────────────────────

describe('touchConversation', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('auto-reopens a resolved conversation on new message', async () => {
    const resolvedConv = makeConversation({ status: 'resolved', assigned_to: 'user-1' });
    const reopenedConv = makeConversation({ status: 'open', assigned_to: null });

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([resolvedConv]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([reopenedConv]),
          }),
        }),
      }),
    } as never);

    const result = await touchConversation('tenant-1', 'inbox-1', 'New message');
    expect(result.status).toBe('open');
    expect(result.assigned_to).toBeNull();
  });

  it('keeps status unchanged for non-resolved conversations', async () => {
    const pendingConv = makeConversation({ status: 'pending', assigned_to: 'user-1' });
    const updatedConv = makeConversation({ status: 'pending', assigned_to: 'user-1', last_message_preview: 'New msg' });

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([pendingConv]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedConv]),
          }),
        }),
      }),
    } as never);

    const result = await touchConversation('tenant-1', 'inbox-1', 'New msg');
    expect(result.status).toBe('pending');
    expect(result.assigned_to).toBe('user-1');
  });

  it('throws NotFoundError when conversation does not exist', async () => {
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

    await expect(touchConversation('tenant-1', 'nonexistent', 'msg')).rejects.toThrow(NotFoundError);
  });
});
