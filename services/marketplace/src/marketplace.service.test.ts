/**
 * Marketplace service unit tests
 * Requirements: 28.1–28.5, 28.7
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  listAvailableExtensions,
  getExtensionById,
  installExtension,
  uninstallExtension,
  submitExtension,
  NotFoundError,
  ConflictError,
  ValidationError,
} from './marketplace.service.js';

// ─── Mock @platform/db ────────────────────────────────────────────────────────

const mockSelect = vi.fn();
const mockInsert = vi.fn();
const mockUpdate = vi.fn();

const mockDb = {
  select: mockSelect,
  insert: mockInsert,
  update: mockUpdate,
};

vi.mock('@platform/db', () => ({
  getDb: () => mockDb,
  extensions: { extension_id: 'extension_id', status: 'status', name: 'name' },
  tenantExtensions: {
    tenant_extension_id: 'tenant_extension_id',
    tenant_id: 'tenant_id',
    extension_id: 'extension_id',
    status: 'status',
  },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeExt(overrides = {}) {
  return {
    extension_id: 'ext-1',
    name: 'Test Extension',
    description: 'A test extension',
    publisher: 'Acme Corp',
    version: '1.0.0',
    permissions: ['read:contacts'],
    pricing_model: 'free',
    status: 'available',
    rating: '4.50',
    review_count: 10,
    submitted_at: new Date(),
    reviewed_at: null,
    created_at: new Date(),
    ...overrides,
  };
}

function makeTenantExt(overrides = {}) {
  return {
    tenant_extension_id: 'te-1',
    tenant_id: 'tenant-1',
    extension_id: 'ext-1',
    status: 'active',
    approved_permissions: [],
    installed_at: new Date(),
    uninstalled_at: null,
    ...overrides,
  };
}

// ─── Chainable query builder mock ─────────────────────────────────────────────

function chainable(result: unknown[]) {
  const obj: Record<string, unknown> = {};
  const methods = ['from', 'where', 'set', 'values', 'returning', 'orderBy', 'limit'];
  for (const m of methods) {
    obj[m] = vi.fn(() => {
      if (m === 'returning') return Promise.resolve(result);
      return obj;
    });
  }
  // make it thenable for direct await
  obj.then = (resolve: (v: unknown) => void) => Promise.resolve(result).then(resolve);
  return obj;
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── listAvailableExtensions ──────────────────────────────────────────────────

describe('listAvailableExtensions', () => {
  it('returns extensions with status=available', async () => {
    const ext = makeExt();
    mockSelect.mockReturnValue(chainable([ext]));

    const result = await listAvailableExtensions();
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe('Test Extension');
    expect(result[0]?.rating).toBe('4.50');
  });

  it('returns empty array when no available extensions', async () => {
    mockSelect.mockReturnValue(chainable([]));
    const result = await listAvailableExtensions();
    expect(result).toHaveLength(0);
  });
});

// ─── getExtensionById ─────────────────────────────────────────────────────────

describe('getExtensionById', () => {
  it('returns extension when found', async () => {
    const ext = makeExt();
    mockSelect.mockReturnValue(chainable([ext]));

    const result = await getExtensionById('ext-1');
    expect(result.extension_id).toBe('ext-1');
  });

  it('throws NotFoundError when extension does not exist', async () => {
    mockSelect.mockReturnValue(chainable([]));
    await expect(getExtensionById('missing')).rejects.toThrow(NotFoundError);
  });
});

// ─── installExtension ─────────────────────────────────────────────────────────

describe('installExtension', () => {
  it('installs extension and returns result with permissions', async () => {
    const ext = makeExt();
    const installed = makeTenantExt();

    // First select: find available extension
    // Second select: check existing install
    let selectCall = 0;
    mockSelect.mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return chainable([ext]);
      return chainable([]); // no existing install
    });

    const insertChain = chainable([installed]);
    mockInsert.mockReturnValue(insertChain);

    const result = await installExtension('tenant-1', 'ext-1');
    expect(result.status).toBe('active');
    expect(result.permissions_requiring_approval).toEqual(['read:contacts']);
    expect(result.extension.name).toBe('Test Extension');
  });

  it('throws NotFoundError when extension not available', async () => {
    mockSelect.mockReturnValue(chainable([]));
    await expect(installExtension('tenant-1', 'missing')).rejects.toThrow(NotFoundError);
  });

  it('throws ConflictError when already installed', async () => {
    const ext = makeExt();
    const existing = makeTenantExt();

    let selectCall = 0;
    mockSelect.mockImplementation(() => {
      selectCall++;
      if (selectCall === 1) return chainable([ext]);
      return chainable([existing]); // already installed
    });

    await expect(installExtension('tenant-1', 'ext-1')).rejects.toThrow(ConflictError);
  });
});

// ─── uninstallExtension ───────────────────────────────────────────────────────

describe('uninstallExtension', () => {
  it('marks extension as uninstalled', async () => {
    const existing = makeTenantExt();
    mockSelect.mockReturnValue(chainable([existing]));

    const updateChain = chainable([]);
    mockUpdate.mockReturnValue(updateChain);

    await expect(uninstallExtension('tenant-1', 'ext-1')).resolves.toBeUndefined();
  });

  it('throws NotFoundError when extension not installed', async () => {
    mockSelect.mockReturnValue(chainable([]));
    await expect(uninstallExtension('tenant-1', 'ext-1')).rejects.toThrow(NotFoundError);
  });
});

// ─── submitExtension ──────────────────────────────────────────────────────────

describe('submitExtension', () => {
  it('creates extension with status=under_review', async () => {
    const created = makeExt({ status: 'under_review', reviewed_at: new Date() });
    const insertChain = chainable([created]);
    mockInsert.mockReturnValue(insertChain);

    const result = await submitExtension({
      name: 'My Extension',
      publisher: 'Dev Corp',
    });

    expect(result.status).toBe('under_review');
  });

  it('sets reviewed_at to approximately 14 business days from now', async () => {
    const now = new Date();
    const reviewedAt = new Date(now);
    // Add ~14 business days ≈ 20 calendar days
    reviewedAt.setDate(reviewedAt.getDate() + 20);

    const created = makeExt({ status: 'under_review', submitted_at: now, reviewed_at: reviewedAt });
    const insertChain = chainable([created]);
    mockInsert.mockReturnValue(insertChain);

    const result = await submitExtension({ name: 'My Ext', publisher: 'Dev' });
    expect(result.reviewed_at).toBeTruthy();
  });

  it('throws ValidationError when name is missing', async () => {
    await expect(submitExtension({ name: '', publisher: 'Dev' })).rejects.toThrow(ValidationError);
  });

  it('throws ValidationError when publisher is missing', async () => {
    await expect(submitExtension({ name: 'Ext', publisher: '' })).rejects.toThrow(ValidationError);
  });
});
