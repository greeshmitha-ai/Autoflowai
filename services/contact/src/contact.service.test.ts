import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContactService, ValidationError } from './contact.service.js';

// Mock all external dependencies
vi.mock('@platform/db', () => ({
  getDb: vi.fn(() => ({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    offset: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockResolvedValue([]),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([]),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    execute: vi.fn().mockResolvedValue({ rows: [] }),
  })),
  contacts: { tenant_id: 'tenant_id', contact_id: 'contact_id', pii_erasure_requested_at: 'pii_erasure_requested_at', lifecycle_stage: 'lifecycle_stage', lead_score: 'lead_score', created_at: 'created_at' },
  importJobs: { job_id: 'job_id', tenant_id: 'tenant_id', status: 'status' },
}));

vi.mock('@platform/events', () => ({
  createPublisher: vi.fn(() => ({
    connect: vi.fn(),
    publish: vi.fn(),
    disconnect: vi.fn(),
  })),
}));

vi.mock('./elasticsearch.js', () => ({
  indexContact: vi.fn(),
  searchContacts: vi.fn().mockResolvedValue({ hits: [], total: 0 }),
  deleteContactFromIndex: vi.fn(),
}));

const mockEsClient = {} as never;

describe('ContactService', () => {
  let service: ContactService;

  beforeEach(() => {
    service = new ContactService(mockEsClient, ['localhost:9092']);
    vi.clearAllMocks();
  });

  describe('createContact', () => {
    it('throws ValidationError for invalid email', async () => {
      await expect(
        service.createContact('tenant-1', 'user-1', { email: 'not-an-email' }),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for lead_score out of range', async () => {
      await expect(
        service.createContact('tenant-1', 'user-1', { lead_score: 150 }),
      ).rejects.toThrow(ValidationError);

      await expect(
        service.createContact('tenant-1', 'user-1', { lead_score: -1 }),
      ).rejects.toThrow(ValidationError);
    });

    it('accepts valid email', async () => {
      const { getDb } = await import('@platform/db');
      const mockDb = {
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([{
          contact_id: 'c-1',
          tenant_id: 'tenant-1',
          full_name: 'Test User',
          email: 'test@example.com',
          phone: null,
          company_name: null,
          tags: [],
          lifecycle_stage: null,
          lead_score: 50,
          lead_score_confidence: 'low',
          pii_erasure_requested_at: null,
          created_at: new Date(),
          updated_at: new Date(),
        }]),
      };
      vi.mocked(getDb).mockReturnValue(mockDb as never);

      const contact = await service.createContact('tenant-1', 'user-1', {
        email: 'test@example.com',
        full_name: 'Test User',
      });

      expect(contact.email).toBe('test@example.com');
    });
  });

  describe('updateContact', () => {
    it('throws ValidationError for invalid email on update', async () => {
      await expect(
        service.updateContact('tenant-1', 'contact-1', { email: 'bad@@email' }),
      ).rejects.toThrow(ValidationError);
    });

    it('throws ValidationError for lead_score out of range on update', async () => {
      await expect(
        service.updateContact('tenant-1', 'contact-1', { lead_score: 101 }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('purgePiiFields', () => {
    it('returns count of purged contacts', async () => {
      const { getDb } = await import('@platform/db');
      const mockDb = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        returning: vi.fn().mockResolvedValue([
          { contact_id: 'c-1' },
          { contact_id: 'c-2' },
        ]),
      };
      vi.mocked(getDb).mockReturnValue(mockDb as never);

      const count = await service.purgePiiFields();
      expect(count).toBe(2);
    });
  });
});
