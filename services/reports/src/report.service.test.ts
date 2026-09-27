import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createReport,
  listReports,
  getReport,
  updateReport,
  executeReport,
  createOrUpdateSchedule,
  computeNextRunAt,
  ValidationError,
  NotFoundError,
} from './report.service.js';
import type { ReportDefinition } from '@platform/db';

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@platform/db', () => {
  const reports = {
    report_id: 'report_id',
    tenant_id: 'tenant_id',
    name: 'name',
    definition: 'definition',
    created_by: 'created_by',
    created_at: 'created_at',
    updated_at: 'updated_at',
  };
  const reportSchedules = {
    schedule_id: 'schedule_id',
    report_id: 'report_id',
    tenant_id: 'tenant_id',
    frequency: 'frequency',
    recipients: 'recipients',
    next_run_at: 'next_run_at',
    created_at: 'created_at',
  };
  const contacts = { tenant_id: 'tenant_id', created_at: 'created_at', lead_score: 'lead_score' };
  const campaigns = { tenant_id: 'tenant_id', created_at: 'created_at' };
  const deals = { tenant_id: 'tenant_id', created_at: 'created_at', value: 'value' };
  const surveys = { tenant_id: 'tenant_id' };
  const calls = { tenant_id: 'tenant_id', duration_seconds: 'duration_seconds' };

  return {
    getDb: vi.fn(),
    reports,
    reportSchedules,
    contacts,
    campaigns,
    deals,
    surveys,
    calls,
    sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values, _isSql: true })),
  };
});

vi.mock('@platform/cache', () => ({
  TenantCache: vi.fn().mockImplementation(() => ({
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue(undefined),
    del: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((col, val) => ({ col, val, op: 'eq' })),
  and: vi.fn((...args) => ({ args, op: 'and' })),
  desc: vi.fn((col) => ({ col, dir: 'desc' })),
  lte: vi.fn((col, val) => ({ col, val, op: 'lte' })),
  sql: vi.fn((strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values, _isSql: true })),
}));

// ─── createReport ─────────────────────────────────────────────────────────────

describe('createReport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws ValidationError when name is empty', async () => {
    await expect(
      createReport('tenant-1', 'user-1', {
        name: '',
        definition: { metrics: [], visualizations: [], filters: [] },
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when name is whitespace', async () => {
    await expect(
      createReport('tenant-1', 'user-1', {
        name: '   ',
        definition: { metrics: [], visualizations: [], filters: [] },
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('creates a report and returns it', async () => {
    const fakeReport = {
      report_id: 'report-uuid',
      tenant_id: 'tenant-1',
      name: 'My Report',
      definition: { metrics: [], visualizations: [], filters: [] },
      created_by: 'user-1',
      created_at: new Date(),
      updated_at: new Date(),
    };

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([fakeReport]),
        }),
      }),
    } as never);

    const result = await createReport('tenant-1', 'user-1', {
      name: 'My Report',
      definition: { metrics: [], visualizations: [], filters: [] },
    });

    expect(result.report_id).toBe('report-uuid');
    expect(result.name).toBe('My Report');
  });

  it('trims whitespace from name', async () => {
    const fakeReport = {
      report_id: 'r1',
      tenant_id: 'tenant-1',
      name: 'Trimmed',
      definition: { metrics: [], visualizations: [], filters: [] },
      created_by: 'user-1',
      created_at: new Date(),
      updated_at: new Date(),
    };

    const { getDb } = await import('@platform/db');
    const mockValues = vi.fn().mockReturnValue({
      returning: vi.fn().mockResolvedValue([fakeReport]),
    });
    vi.mocked(getDb).mockReturnValue({
      insert: vi.fn().mockReturnValue({ values: mockValues }),
    } as never);

    await createReport('tenant-1', 'user-1', {
      name: '  Trimmed  ',
      definition: { metrics: [], visualizations: [], filters: [] },
    });

    expect(mockValues).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Trimmed' }),
    );
  });
});

// ─── getReport ────────────────────────────────────────────────────────────────

describe('getReport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws NotFoundError when report does not exist', async () => {
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

    await expect(getReport('tenant-1', 'nonexistent')).rejects.toThrow(NotFoundError);
  });

  it('returns the report when found', async () => {
    const fakeReport = {
      report_id: 'r1',
      tenant_id: 'tenant-1',
      name: 'Test',
      definition: { metrics: [], visualizations: [], filters: [] },
      created_by: 'user-1',
      created_at: new Date(),
      updated_at: new Date(),
    };

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([fakeReport]),
          }),
        }),
      }),
    } as never);

    const result = await getReport('tenant-1', 'r1');
    expect(result.report_id).toBe('r1');
  });
});

// ─── updateReport ─────────────────────────────────────────────────────────────

describe('updateReport', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws ValidationError when name is empty string', async () => {
    const fakeReport = {
      report_id: 'r1',
      tenant_id: 'tenant-1',
      name: 'Test',
      definition: { metrics: [], visualizations: [], filters: [] },
      created_by: 'user-1',
      created_at: new Date(),
      updated_at: new Date(),
    };

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([fakeReport]),
          }),
        }),
      }),
    } as never);

    await expect(updateReport('tenant-1', 'r1', { name: '' })).rejects.toThrow(ValidationError);
  });
});

// ─── executeReport — graceful metric error handling (Req 23.7) ────────────────

describe('executeReport — graceful unavailable-metric handling', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns error on visualization when metric is unavailable, without breaking others', async () => {
    const definition: ReportDefinition = {
      metrics: [
        { id: 'm1', subsystem: 'contacts', field: 'id', aggregation: 'count', label: 'Contacts' },
        { id: 'm2', subsystem: 'contacts', field: 'unknown_field', aggregation: 'sum', label: 'Unknown' },
      ],
      visualizations: [
        { id: 'v1', type: 'metric_card', metric_ids: ['m1'], title: 'Contact count' },
        { id: 'v2', type: 'metric_card', metric_ids: ['m2'], title: 'Unknown metric' },
      ],
      filters: [],
    };

    const fakeReport = {
      report_id: 'r1',
      tenant_id: 'tenant-1',
      name: 'Test',
      definition,
      created_by: 'user-1',
      created_at: new Date(),
      updated_at: new Date(),
    };

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([fakeReport]),
          }),
        }),
      }),
    } as never);

    const result = await executeReport('tenant-1', 'r1');

    // Should have 2 visualizations
    expect(result.visualizations).toHaveLength(2);

    // v1 (contacts count) should succeed or fail gracefully
    const v1 = result.visualizations.find((v) => v.visualization_id === 'v1');
    const v2 = result.visualizations.find((v) => v.visualization_id === 'v2');

    expect(v1).toBeDefined();
    expect(v2).toBeDefined();

    // v2 should have error (unknown field)
    expect(v2?.error).toBe('metric_unavailable');
    expect(v2?.metric).toBe('m2');
  });

  it('returns error with metric id when metric_ids references unknown metric', async () => {
    const definition: ReportDefinition = {
      metrics: [],
      visualizations: [
        { id: 'v1', type: 'bar_chart', metric_ids: ['nonexistent-metric'], title: 'Bad viz' },
      ],
      filters: [],
    };

    const fakeReport = {
      report_id: 'r1',
      tenant_id: 'tenant-1',
      name: 'Test',
      definition,
      created_by: 'user-1',
      created_at: new Date(),
      updated_at: new Date(),
    };

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([fakeReport]),
          }),
        }),
      }),
    } as never);

    const result = await executeReport('tenant-1', 'r1');

    expect(result.visualizations).toHaveLength(1);
    expect(result.visualizations[0]?.error).toBe('metric_unavailable');
    expect(result.visualizations[0]?.metric).toBe('nonexistent-metric');
  });
});

// ─── createOrUpdateSchedule ───────────────────────────────────────────────────

describe('createOrUpdateSchedule', () => {
  beforeEach(() => vi.clearAllMocks());

  it('throws ValidationError when frequency is missing', async () => {
    await expect(
      createOrUpdateSchedule('tenant-1', 'report-1', {
        frequency: '' as never,
        recipients: ['a@b.com'],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when recipients is empty', async () => {
    await expect(
      createOrUpdateSchedule('tenant-1', 'report-1', {
        frequency: 'daily',
        recipients: [],
      }),
    ).rejects.toThrow(ValidationError);
  });

  it('creates a schedule and returns it', async () => {
    const fakeReport = {
      report_id: 'r1',
      tenant_id: 'tenant-1',
      name: 'Test',
      definition: { metrics: [], visualizations: [], filters: [] },
      created_by: 'user-1',
      created_at: new Date(),
      updated_at: new Date(),
    };

    const fakeSchedule = {
      schedule_id: 'sched-1',
      report_id: 'r1',
      tenant_id: 'tenant-1',
      frequency: 'daily' as const,
      recipients: ['a@b.com'],
      next_run_at: new Date(),
      created_at: new Date(),
    };

    const { getDb } = await import('@platform/db');
    vi.mocked(getDb).mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([fakeReport]),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([fakeSchedule]),
        }),
      }),
    } as never);

    const result = await createOrUpdateSchedule('tenant-1', 'r1', {
      frequency: 'daily',
      recipients: ['a@b.com'],
    });

    expect(result.schedule_id).toBe('sched-1');
    expect(result.frequency).toBe('daily');
  });
});

// ─── computeNextRunAt ─────────────────────────────────────────────────────────

describe('computeNextRunAt', () => {
  it('returns a future date for daily frequency', () => {
    const next = computeNextRunAt('daily');
    expect(next.getTime()).toBeGreaterThan(Date.now());
  });

  it('returns a future date for weekly frequency', () => {
    const next = computeNextRunAt('weekly');
    expect(next.getTime()).toBeGreaterThan(Date.now());
  });

  it('returns a future date for monthly frequency', () => {
    const next = computeNextRunAt('monthly');
    expect(next.getTime()).toBeGreaterThan(Date.now());
  });

  it('daily next run is within 2 days', () => {
    const next = computeNextRunAt('daily');
    const twoDaysFromNow = Date.now() + 2 * 24 * 60 * 60 * 1000;
    expect(next.getTime()).toBeLessThanOrEqual(twoDaysFromNow);
  });

  it('weekly next run is within 8 days', () => {
    const next = computeNextRunAt('weekly');
    const eightDaysFromNow = Date.now() + 8 * 24 * 60 * 60 * 1000;
    expect(next.getTime()).toBeLessThanOrEqual(eightDaysFromNow);
  });
});
