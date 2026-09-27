import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createTask,
  updateTask,
  listTasks,
  createBookingSlot,
  ValidationError,
  NotFoundError,
} from './task.service.js';

vi.mock('@platform/db', () => {
  const tasks = { task_id: 'task_id', tenant_id: 'tenant_id', assigned_to: 'assigned_to', status: 'status', due_date: 'due_date', priority: 'priority' };
  const bookingSlots = { slot_id: 'slot_id', tenant_id: 'tenant_id', user_id: 'user_id', is_available: 'is_available', start_time: 'start_time', end_time: 'end_time' };
  const bookings = { booking_id: 'booking_id', tenant_id: 'tenant_id', slot_id: 'slot_id' };

  return {
    getDb: vi.fn(),
    tasks,
    bookingSlots,
    bookings,
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
  lte: vi.fn((col, val) => ({ col, val, op: 'lte' })),
  gte: vi.fn((col, val) => ({ col, val, op: 'gte' })),
  asc: vi.fn((col) => ({ col, dir: 'asc' })),
  desc: vi.fn((col) => ({ col, dir: 'desc' })),
  sql: vi.fn(),
}));

// ─── createTask ───────────────────────────────────────────────────────────────

describe('createTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws ValidationError when title is missing', async () => {
    await expect(
      createTask('tenant-1', { title: '', assigned_to: 'user-1' }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when assigned_to is missing', async () => {
    await expect(
      createTask('tenant-1', { title: 'My Task', assigned_to: '' }),
    ).rejects.toThrow(ValidationError);
  });

  it('creates a task with default priority medium', async () => {
    const fakeTask = {
      task_id: 'task-uuid',
      tenant_id: 'tenant-1',
      title: 'My Task',
      description: null,
      due_date: null,
      priority: 'medium',
      assigned_to: 'user-1',
      contact_id: null,
      deal_id: null,
      status: 'open',
      created_at: new Date(),
    };

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([fakeTask]),
        }),
      }),
    } as never);

    const result = await createTask('tenant-1', { title: 'My Task', assigned_to: 'user-1' });
    expect(result.priority).toBe('medium');
    expect(result.status).toBe('open');
    expect(result.title).toBe('My Task');
  });

  it('creates a task with specified priority', async () => {
    const fakeTask = {
      task_id: 'task-uuid',
      tenant_id: 'tenant-1',
      title: 'Urgent Task',
      description: null,
      due_date: null,
      priority: 'urgent',
      assigned_to: 'user-1',
      contact_id: null,
      deal_id: null,
      status: 'open',
      created_at: new Date(),
    };

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([fakeTask]),
        }),
      }),
    } as never);

    const result = await createTask('tenant-1', {
      title: 'Urgent Task',
      assigned_to: 'user-1',
      priority: 'urgent',
    });
    expect(result.priority).toBe('urgent');
  });

  it('trims whitespace from title', async () => {
    const fakeTask = {
      task_id: 'task-uuid',
      tenant_id: 'tenant-1',
      title: 'Trimmed',
      description: null,
      due_date: null,
      priority: 'medium',
      assigned_to: 'user-1',
      contact_id: null,
      deal_id: null,
      status: 'open',
      created_at: new Date(),
    };

    const { getDb } = await import('@platform/db');
    const mockInsertValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([fakeTask]),
    });
    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn().mockReturnValue({ values: mockInsertValues }),
    } as never);

    await createTask('tenant-1', { title: '  Trimmed  ', assigned_to: 'user-1' });
    expect(mockInsertValues).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Trimmed' }),
    );
  });
});

// ─── listTasks sorting ────────────────────────────────────────────────────────

describe('listTasks sorting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const makeTasks = () => [
    { task_id: '1', due_date: new Date('2024-06-10'), priority: 'low', assigned_to: 'u1', tenant_id: 't1', title: 'A', status: 'open', description: null, contact_id: null, deal_id: null, created_at: new Date() },
    { task_id: '2', due_date: new Date('2024-06-05'), priority: 'urgent', assigned_to: 'u1', tenant_id: 't1', title: 'B', status: 'open', description: null, contact_id: null, deal_id: null, created_at: new Date() },
    { task_id: '3', due_date: null, priority: 'high', assigned_to: 'u1', tenant_id: 't1', title: 'C', status: 'open', description: null, contact_id: null, deal_id: null, created_at: new Date() },
  ];

  it('sorts by due_date ascending by default (nulls last)', async () => {
    const { getDb } = await import('@platform/db');
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(makeTasks()),
        }),
      }),
    };
    vi.mocked(getDb).mockReturnValue(mockDb as never);

    const result = await listTasks('t1', 'u1', {});
    expect(result[0]!.task_id).toBe('2'); // earliest due date
    expect(result[1]!.task_id).toBe('1');
    expect(result[2]!.task_id).toBe('3'); // null last
  });

  it('sorts by priority descending (urgent first)', async () => {
    const { getDb } = await import('@platform/db');
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(makeTasks()),
        }),
      }),
    };
    vi.mocked(getDb).mockReturnValue(mockDb as never);

    const result = await listTasks('t1', 'u1', { sort_by: 'priority', order: 'desc' });
    expect(result[0]!.priority).toBe('urgent');
    expect(result[1]!.priority).toBe('high');
    expect(result[2]!.priority).toBe('low');
  });

  it('sorts by priority ascending (low first)', async () => {
    const { getDb } = await import('@platform/db');
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(makeTasks()),
        }),
      }),
    };
    vi.mocked(getDb).mockReturnValue(mockDb as never);

    const result = await listTasks('t1', 'u1', { sort_by: 'priority', order: 'asc' });
    expect(result[0]!.priority).toBe('low');
    expect(result[result.length - 1]!.priority).toBe('urgent');
  });
});

// ─── createBookingSlot ────────────────────────────────────────────────────────

describe('createBookingSlot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws ValidationError when end_time is before start_time', async () => {
    await expect(
      createBookingSlot('tenant-1', 'user-1', {
        start_time: '2024-06-10T10:00:00Z',
        end_time: '2024-06-10T09:00:00Z',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when end_time equals start_time', async () => {
    await expect(
      createBookingSlot('tenant-1', 'user-1', {
        start_time: '2024-06-10T10:00:00Z',
        end_time: '2024-06-10T10:00:00Z',
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('creates a slot with is_available=true', async () => {
    const fakeSlot = {
      slot_id: 'slot-uuid',
      tenant_id: 'tenant-1',
      user_id: 'user-1',
      start_time: new Date('2024-06-10T10:00:00Z'),
      end_time: new Date('2024-06-10T11:00:00Z'),
      is_available: true,
      created_at: new Date(),
    };

    const { getDb } = await import('@platform/db');
    const mockDb = {
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([fakeSlot]),
        }),
      }),
    };
    vi.mocked(getDb).mockReturnValue(mockDb as never);

    const result = await createBookingSlot('tenant-1', 'user-1', {
      start_time: '2024-06-10T10:00:00Z',
      end_time: '2024-06-10T11:00:00Z',
    });
    expect(result.is_available).toBe(true);
  });
});

// ─── updateTask ───────────────────────────────────────────────────────────────

describe('updateTask', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws NotFoundError when task does not exist', async () => {
    const { getDb } = await import('@platform/db');
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      update: vi.fn(),
    };
    vi.mocked(getDb).mockReturnValue(mockDb as never);

    await expect(
      updateTask('tenant-1', 'nonexistent-id', { title: 'New Title' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('updates task status to completed', async () => {
    const existingTask = {
      task_id: 'task-1',
      tenant_id: 'tenant-1',
      title: 'My Task',
      status: 'open',
      priority: 'medium',
      assigned_to: 'user-1',
      due_date: null,
      description: null,
      contact_id: null,
      deal_id: null,
      created_at: new Date(),
    };
    const updatedTask = { ...existingTask, status: 'completed' };

    const { getDb } = await import('@platform/db');
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([existingTask]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updatedTask]),
          }),
        }),
      }),
    };
    vi.mocked(getDb).mockReturnValue(mockDb as never);

    const result = await updateTask('tenant-1', 'task-1', { status: 'completed' });
    expect(result.status).toBe('completed');
  });
});
