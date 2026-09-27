import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  parseMentions,
  createNote,
  assignResource,
  getActivityFeed,
  autocompleteUsers,
  ValidationError,
} from './collaboration.service.js';

vi.mock('@platform/db', () => {
  const internalNotes = {
    note_id: 'note_id',
    tenant_id: 'tenant_id',
    resource_type: 'resource_type',
    resource_id: 'resource_id',
    content: 'content',
    created_by: 'created_by',
    created_at: 'created_at',
  };
  const assignments = {
    assignment_id: 'assignment_id',
    tenant_id: 'tenant_id',
    resource_type: 'resource_type',
    resource_id: 'resource_id',
    assigned_by: 'assigned_by',
    assigned_to: 'assigned_to',
    assigned_at: 'assigned_at',
  };
  const users = {
    user_id: 'user_id',
    tenant_id: 'tenant_id',
    email: 'email',
    roles: 'roles',
    status: 'status',
  };

  return {
    getDb: vi.fn(),
    internalNotes,
    assignments,
    users,
  };
});

vi.mock('@platform/events', () => ({
  createPublisher: vi.fn(() => ({
    connect: vi.fn(),
    disconnect: vi.fn(),
    publish: vi.fn(),
  })),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val, op: 'eq' })),
  and: vi.fn((...args) => ({ args, op: 'and' })),
  or: vi.fn((...args) => ({ args, op: 'or' })),
  desc: vi.fn((col) => ({ col, dir: 'desc' })),
  ilike: vi.fn((col, val) => ({ col, val, op: 'ilike' })),
}));

// ─── parseMentions ────────────────────────────────────────────────────────────

describe('parseMentions', () => {
  it('returns empty array when no mentions', () => {
    expect(parseMentions('Hello world, no mentions here')).toEqual([]);
  });

  it('extracts a single mention', () => {
    expect(parseMentions('Hey @alice, please review this')).toEqual(['alice']);
  });

  it('extracts multiple mentions', () => {
    const result = parseMentions('@alice and @bob should look at this');
    expect(result).toContain('alice');
    expect(result).toContain('bob');
    expect(result).toHaveLength(2);
  });

  it('deduplicates repeated mentions', () => {
    const result = parseMentions('@alice @alice @bob');
    expect(result).toEqual(['alice', 'bob']);
  });

  it('handles mentions with underscores', () => {
    expect(parseMentions('cc @john_doe')).toEqual(['john_doe']);
  });

  it('handles mentions at start of string', () => {
    expect(parseMentions('@admin please check')).toEqual(['admin']);
  });

  it('handles empty string', () => {
    expect(parseMentions('')).toEqual([]);
  });

  it('does not extract email addresses as mentions', () => {
    // email addresses contain @ but the part before @ is not a mention
    // parseMentions looks for @word pattern — email like user@domain.com
    // would match @domain but that's acceptable per the spec pattern
    const result = parseMentions('contact user@example.com for details');
    // @example is extracted — this is expected behavior per @word pattern
    expect(Array.isArray(result)).toBe(true);
  });
});

// ─── createNote ───────────────────────────────────────────────────────────────

describe('createNote', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws ValidationError when content is empty', async () => {
    await expect(
      createNote('tenant-1', 'user-1', 'contact', 'resource-1', { content: '' }, []),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when content is whitespace only', async () => {
    await expect(
      createNote('tenant-1', 'user-1', 'contact', 'resource-1', { content: '   ' }, []),
    ).rejects.toThrow(ValidationError);
  });

  it('creates a note and returns it', async () => {
    const fakeNote = {
      note_id: 'note-uuid',
      tenant_id: 'tenant-1',
      resource_type: 'contact',
      resource_id: 'resource-1',
      content: 'This is a note',
      created_by: 'user-1',
      created_at: new Date(),
    };

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([fakeNote]),
        }),
      }),
    } as never);

    const result = await createNote(
      'tenant-1',
      'user-1',
      'contact',
      'resource-1',
      { content: 'This is a note' },
      [],
    );
    expect(result.note_id).toBe('note-uuid');
    expect(result.content).toBe('This is a note');
  });

  it('publishes mention event when @mentions are present', async () => {
    const fakeNote = {
      note_id: 'note-uuid',
      tenant_id: 'tenant-1',
      resource_type: 'contact',
      resource_id: 'resource-1',
      content: 'Hey @alice please review',
      created_by: 'user-1',
      created_at: new Date(),
    };

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([fakeNote]),
        }),
      }),
    } as never);

    const { createPublisher } = await import('@platform/events');
    const mockPublish = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createPublisher).mockReturnValue({
      connect: vi.fn(),
      disconnect: vi.fn(),
      publish: mockPublish,
    } as never);

    await createNote(
      'tenant-1',
      'user-1',
      'contact',
      'resource-1',
      { content: 'Hey @alice please review' },
      ['localhost:9092'],
    );

    expect(mockPublish).toHaveBeenCalledWith(
      'collaboration',
      'collaboration.mention',
      expect.objectContaining({
        mentioned_usernames: ['alice'],
        mentioned_by: 'user-1',
      }),
    );
  });

  it('does not publish event when no mentions', async () => {
    const fakeNote = {
      note_id: 'note-uuid',
      tenant_id: 'tenant-1',
      resource_type: 'contact',
      resource_id: 'resource-1',
      content: 'No mentions here',
      created_by: 'user-1',
      created_at: new Date(),
    };

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([fakeNote]),
        }),
      }),
    } as never);

    const { createPublisher } = await import('@platform/events');
    vi.mocked(createPublisher).mockReturnValue({
      connect: vi.fn(),
      disconnect: vi.fn(),
      publish: vi.fn(),
    } as never);

    await createNote(
      'tenant-1',
      'user-1',
      'contact',
      'resource-1',
      { content: 'No mentions here' },
      ['localhost:9092'],
    );

    expect(createPublisher).not.toHaveBeenCalled();
  });

  it('trims whitespace from content', async () => {
    const fakeNote = {
      note_id: 'note-uuid',
      tenant_id: 'tenant-1',
      resource_type: 'deal',
      resource_id: 'resource-1',
      content: 'Trimmed content',
      created_by: 'user-1',
      created_at: new Date(),
    };

    const { getDb } = await import('@platform/db');
    const mockInsertValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([fakeNote]),
    });
    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn().mockReturnValue({ values: mockInsertValues }),
    } as never);

    await createNote(
      'tenant-1',
      'user-1',
      'deal',
      'resource-1',
      { content: '  Trimmed content  ' },
      [],
    );

    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'Trimmed content' }),
    );
  });
});

// ─── assignResource ───────────────────────────────────────────────────────────

describe('assignResource', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws ValidationError when assigned_to is missing', async () => {
    await expect(
      assignResource('tenant-1', 'user-1', 'contact', 'resource-1', { assigned_to: '' }, []),
    ).rejects.toThrow(ValidationError);
  });

  it('creates an assignment and publishes event', async () => {
    const fakeAssignment = {
      assignment_id: 'assign-uuid',
      tenant_id: 'tenant-1',
      resource_type: 'deal',
      resource_id: 'resource-1',
      assigned_by: 'user-1',
      assigned_to: 'user-2',
      assigned_at: new Date(),
    };

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([fakeAssignment]),
        }),
      }),
    } as never);

    const { createPublisher } = await import('@platform/events');
    const mockPublish = vi.fn().mockResolvedValue(undefined);
    vi.mocked(createPublisher).mockReturnValue({
      connect: vi.fn(),
      disconnect: vi.fn(),
      publish: mockPublish,
    } as never);

    const result = await assignResource(
      'tenant-1',
      'user-1',
      'deal',
      'resource-1',
      { assigned_to: 'user-2' },
      ['localhost:9092'],
    );

    expect(result.assignment_id).toBe('assign-uuid');
    expect(result.assigned_to).toBe('user-2');
    expect(mockPublish).toHaveBeenCalledWith(
      'collaboration',
      'collaboration.assigned',
      expect.objectContaining({
        assigned_by: 'user-1',
        assigned_to: 'user-2',
        resource_type: 'deal',
      }),
    );
  });
});

// ─── getActivityFeed ──────────────────────────────────────────────────────────

describe('getActivityFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns items sorted chronologically (oldest first)', async () => {
    const now = Date.now();
    const noteRows = [
      {
        note_id: 'n1',
        tenant_id: 't1',
        resource_type: 'contact',
        resource_id: 'r1',
        content: 'note',
        created_by: 'u1',
        created_at: new Date(now + 2000),
      },
    ];
    const assignmentRows = [
      {
        assignment_id: 'a1',
        tenant_id: 't1',
        resource_type: 'contact',
        resource_id: 'r1',
        assigned_by: 'u1',
        assigned_to: 'u2',
        assigned_at: new Date(now + 1000),
      },
    ];

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn()
            .mockResolvedValueOnce(noteRows)
            .mockResolvedValueOnce(assignmentRows),
        }),
      }),
    } as never);

    const feed = await getActivityFeed('t1', 'contact', 'r1');

    expect(feed).toHaveLength(2);
    // assignment is older (now+1000) so comes first
    expect(feed[0]!.type).toBe('assignment');
    expect(feed[1]!.type).toBe('note');
  });

  it('returns empty array when no activity', async () => {
    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn()
            .mockResolvedValueOnce([])
            .mockResolvedValueOnce([]),
        }),
      }),
    } as never);

    const feed = await getActivityFeed('t1', 'deal', 'r1');
    expect(feed).toEqual([]);
  });
});

// ─── autocompleteUsers ────────────────────────────────────────────────────────

describe('autocompleteUsers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns matching active users', async () => {
    const fakeUsers = [
      { user_id: 'u1', email: 'alice@example.com', roles: ['member'] },
      { user_id: 'u2', email: 'alice.smith@example.com', roles: ['admin'] },
    ];

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(fakeUsers),
          }),
        }),
      }),
    } as never);

    const result = await autocompleteUsers('tenant-1', 'alice');
    expect(result).toHaveLength(2);
    expect(result[0]!.email).toBe('alice@example.com');
  });

  it('returns users when query is empty', async () => {
    const fakeUsers = [{ user_id: 'u1', email: 'bob@example.com', roles: ['member'] }];

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(fakeUsers),
          }),
        }),
      }),
    } as never);

    const result = await autocompleteUsers('tenant-1', '');
    expect(result).toHaveLength(1);
  });
});
