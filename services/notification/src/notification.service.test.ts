import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isInDndWindow,
  filterChannels,
  deliverNotification,
  getUserPreferences,
  upsertUserPreference,
  getRoleDefaults,
  upsertRoleDefault,
  ValidationError,
  CRITICAL_EVENT_TYPES,
  type NotificationChannel,
} from './notification.service.js';

vi.mock('@platform/db', () => {
  const notifications = {
    notification_id: 'notification_id',
    tenant_id: 'tenant_id',
    user_id: 'user_id',
    event_type: 'event_type',
    payload: 'payload',
    channels: 'channels',
    delivered_at: 'delivered_at',
    created_at: 'created_at',
  };
  const notificationPreferences = {
    pref_id: 'pref_id',
    tenant_id: 'tenant_id',
    user_id: 'user_id',
    event_type: 'event_type',
    channels: 'channels',
    dnd_start_hour: 'dnd_start_hour',
    dnd_end_hour: 'dnd_end_hour',
    created_at: 'created_at',
    updated_at: 'updated_at',
  };
  const notificationRoleDefaults = {
    default_id: 'default_id',
    tenant_id: 'tenant_id',
    role: 'role',
    event_type: 'event_type',
    channels: 'channels',
    dnd_start_hour: 'dnd_start_hour',
    dnd_end_hour: 'dnd_end_hour',
    created_at: 'created_at',
    updated_at: 'updated_at',
  };
  return {
    getDb: vi.fn(),
    notifications,
    notificationPreferences,
    notificationRoleDefaults,
  };
});

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val, op: 'eq' })),
  and: vi.fn((...args) => ({ args, op: 'and' })),
}));

vi.mock('./ws-registry.js', () => ({
  broadcastToUser: vi.fn(),
}));

// ─── isInDndWindow ────────────────────────────────────────────────────────────

describe('isInDndWindow', () => {
  it('returns false when no DND configured', () => {
    expect(isInDndWindow(14, null, null)).toBe(false);
    expect(isInDndWindow(14, undefined, undefined)).toBe(false);
  });

  it('returns true for same-day window (9–17) during window', () => {
    expect(isInDndWindow(9, 9, 17)).toBe(true);
    expect(isInDndWindow(12, 9, 17)).toBe(true);
    expect(isInDndWindow(16, 9, 17)).toBe(true);
  });

  it('returns false for same-day window (9–17) outside window', () => {
    expect(isInDndWindow(8, 9, 17)).toBe(false);
    expect(isInDndWindow(17, 9, 17)).toBe(false);
    expect(isInDndWindow(20, 9, 17)).toBe(false);
  });

  it('returns true for overnight window (22–6) during window', () => {
    expect(isInDndWindow(22, 22, 6)).toBe(true);
    expect(isInDndWindow(23, 22, 6)).toBe(true);
    expect(isInDndWindow(0, 22, 6)).toBe(true);
    expect(isInDndWindow(5, 22, 6)).toBe(true);
  });

  it('returns false for overnight window (22–6) outside window', () => {
    expect(isInDndWindow(6, 22, 6)).toBe(false);
    expect(isInDndWindow(12, 22, 6)).toBe(false);
    expect(isInDndWindow(21, 22, 6)).toBe(false);
  });
});

// ─── filterChannels ───────────────────────────────────────────────────────────

describe('filterChannels', () => {
  it('returns all channels when no preference set', () => {
    const result = filterChannels(['in_app', 'email', 'push'], 'task.due_reminder', null, 10);
    expect(result).toEqual(['in_app', 'email', 'push']);
  });

  it('filters to only opted-in channels', () => {
    const pref = {
      pref_id: 'p1',
      tenant_id: 't1',
      user_id: 'u1',
      event_type: 'task.due_reminder',
      channels: ['in_app'] as NotificationChannel[],
      dnd_start_hour: null,
      dnd_end_hour: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const result = filterChannels(['in_app', 'email', 'push'], 'task.due_reminder', pref, 10);
    expect(result).toEqual(['in_app']);
  });

  it('suppresses push and email during DND, keeps in_app', () => {
    const pref = {
      pref_id: 'p1',
      tenant_id: 't1',
      user_id: 'u1',
      event_type: 'task.due_reminder',
      channels: ['in_app', 'email', 'push'] as NotificationChannel[],
      dnd_start_hour: 22,
      dnd_end_hour: 8,
      created_at: new Date(),
      updated_at: new Date(),
    };
    // Hour 23 is within DND window (22–8)
    const result = filterChannels(['in_app', 'email', 'push'], 'task.due_reminder', pref, 23);
    expect(result).toEqual(['in_app']);
  });

  it('allows all channels outside DND window', () => {
    const pref = {
      pref_id: 'p1',
      tenant_id: 't1',
      user_id: 'u1',
      event_type: 'task.due_reminder',
      channels: ['in_app', 'email', 'push'] as NotificationChannel[],
      dnd_start_hour: 22,
      dnd_end_hour: 8,
      created_at: new Date(),
      updated_at: new Date(),
    };
    // Hour 12 is outside DND window
    const result = filterChannels(['in_app', 'email', 'push'], 'task.due_reminder', pref, 12);
    expect(result).toEqual(['in_app', 'email', 'push']);
  });

  it('bypasses DND for critical security events (security.brute_force)', () => {
    const pref = {
      pref_id: 'p1',
      tenant_id: 't1',
      user_id: 'u1',
      event_type: 'security.brute_force',
      channels: ['in_app'] as NotificationChannel[],
      dnd_start_hour: 0,
      dnd_end_hour: 23,
      created_at: new Date(),
      updated_at: new Date(),
    };
    // Even with DND covering all hours, critical events bypass
    const result = filterChannels(['in_app', 'email'], 'security.brute_force', pref, 12);
    expect(result).toEqual(['in_app', 'email']);
  });

  it('bypasses DND for critical security events (security.anomalous_api)', () => {
    const pref = {
      pref_id: 'p1',
      tenant_id: 't1',
      user_id: 'u1',
      event_type: 'security.anomalous_api',
      channels: [] as NotificationChannel[],
      dnd_start_hour: 0,
      dnd_end_hour: 23,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const result = filterChannels(['in_app', 'email'], 'security.anomalous_api', pref, 3);
    expect(result).toEqual(['in_app', 'email']);
  });

  it('CRITICAL_EVENT_TYPES contains security events', () => {
    expect(CRITICAL_EVENT_TYPES.has('security.brute_force')).toBe(true);
    expect(CRITICAL_EVENT_TYPES.has('security.anomalous_api')).toBe(true);
    expect(CRITICAL_EVENT_TYPES.has('task.due_reminder')).toBe(false);
  });
});

// ─── deliverNotification ──────────────────────────────────────────────────────

describe('deliverNotification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('delivers in_app notification via WebSocket and persists record', async () => {
    const fakeNotif = {
      notification_id: 'notif-uuid',
      tenant_id: 'tenant-1',
      user_id: 'user-1',
      event_type: 'task.due_reminder',
      payload: { task_id: 't1' },
      channels: ['in_app'],
      delivered_at: { in_app: new Date().toISOString() },
      created_at: new Date(),
    };

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // no pref
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([fakeNotif]),
        }),
      }),
    } as never);

    const { broadcastToUser } = await import('./ws-registry.js');

    const result = await deliverNotification('tenant-1', {
      user_id: 'user-1',
      event_type: 'task.due_reminder',
      payload: { task_id: 't1' },
      channels: ['in_app'],
    });

    expect(result.notification_id).toBe('notif-uuid');
    expect(broadcastToUser).toHaveBeenCalledWith(
      'tenant-1',
      'user-1',
      expect.objectContaining({ type: 'notification', event_type: 'task.due_reminder' }),
    );
  });

  it('respects user opt-out by filtering channels', async () => {
    const pref = {
      pref_id: 'p1',
      tenant_id: 'tenant-1',
      user_id: 'user-1',
      event_type: 'task.due_reminder',
      channels: ['in_app'],
      dnd_start_hour: null,
      dnd_end_hour: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const fakeNotif = {
      notification_id: 'notif-uuid',
      tenant_id: 'tenant-1',
      user_id: 'user-1',
      event_type: 'task.due_reminder',
      payload: {},
      channels: ['in_app'],
      delivered_at: { in_app: new Date().toISOString() },
      created_at: new Date(),
    };

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([pref]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([fakeNotif]),
        }),
      }),
    } as never);

    const result = await deliverNotification('tenant-1', {
      user_id: 'user-1',
      event_type: 'task.due_reminder',
      payload: {},
      channels: ['in_app', 'email'],
    });

    // Only in_app should be in the persisted channels
    expect(result.channels).toEqual(['in_app']);
  });
});

// ─── upsertUserPreference ─────────────────────────────────────────────────────

describe('upsertUserPreference', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws ValidationError when event_type is missing', async () => {
    await expect(
      upsertUserPreference('t1', 'u1', { event_type: '', channels: ['in_app'] }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when channels is empty', async () => {
    await expect(
      upsertUserPreference('t1', 'u1', { event_type: 'task.due_reminder', channels: [] }),
    ).rejects.toThrow(ValidationError);
  });

  it('creates a new preference when none exists', async () => {
    const fakePref = {
      pref_id: 'pref-uuid',
      tenant_id: 't1',
      user_id: 'u1',
      event_type: 'task.due_reminder',
      channels: ['in_app', 'email'],
      dnd_start_hour: null,
      dnd_end_hour: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]), // no existing
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([fakePref]),
        }),
      }),
    } as never);

    const result = await upsertUserPreference('t1', 'u1', {
      event_type: 'task.due_reminder',
      channels: ['in_app', 'email'],
    });

    expect(result.pref_id).toBe('pref-uuid');
    expect(result.channels).toEqual(['in_app', 'email']);
  });

  it('updates existing preference', async () => {
    const existing = {
      pref_id: 'pref-uuid',
      tenant_id: 't1',
      user_id: 'u1',
      event_type: 'task.due_reminder',
      channels: ['in_app'],
      dnd_start_hour: null,
      dnd_end_hour: null,
      created_at: new Date(),
      updated_at: new Date(),
    };
    const updated = { ...existing, channels: ['in_app', 'email'], dnd_start_hour: 22, dnd_end_hour: 8 };

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([existing]),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      }),
    } as never);

    const result = await upsertUserPreference('t1', 'u1', {
      event_type: 'task.due_reminder',
      channels: ['in_app', 'email'],
      dnd_start_hour: 22,
      dnd_end_hour: 8,
    });

    expect(result.channels).toEqual(['in_app', 'email']);
    expect(result.dnd_start_hour).toBe(22);
    expect(result.dnd_end_hour).toBe(8);
  });
});

// ─── upsertRoleDefault ────────────────────────────────────────────────────────

describe('upsertRoleDefault', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws ValidationError when role is missing', async () => {
    await expect(
      upsertRoleDefault('t1', { role: '', event_type: 'task.due_reminder', channels: ['in_app'] }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when event_type is missing', async () => {
    await expect(
      upsertRoleDefault('t1', { role: 'member', event_type: '', channels: ['in_app'] }),
    ).rejects.toThrow(ValidationError);
  });

  it('creates a new role default', async () => {
    const fakeDefault = {
      default_id: 'def-uuid',
      tenant_id: 't1',
      role: 'member',
      event_type: 'task.due_reminder',
      channels: ['in_app', 'email'],
      dnd_start_hour: null,
      dnd_end_hour: null,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([fakeDefault]),
        }),
      }),
    } as never);

    const result = await upsertRoleDefault('t1', {
      role: 'member',
      event_type: 'task.due_reminder',
      channels: ['in_app', 'email'],
    });

    expect(result.default_id).toBe('def-uuid');
    expect(result.role).toBe('member');
  });
});
