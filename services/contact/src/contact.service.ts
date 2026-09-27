import { eq, and, inArray, isNull, sql } from 'drizzle-orm';
import { getDb, contacts, importJobs, type Contact, type NewContact } from '@platform/db';
import { createPublisher } from '@platform/events';
import type { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { indexContact, searchContacts, deleteContactFromIndex } from './elasticsearch.js';
import type { ContactListQuery, CreateContactBody, UpdateContactBody } from './types.js';
import { isValidEmail } from './email-validator.js';

export interface ContactListResult {
  data: Contact[];
  total: number;
  page: number;
  limit: number;
}

export class ContactService {
  private esClient: ElasticsearchClient;
  private kafkaBrokers: string[];

  constructor(esClient: ElasticsearchClient, kafkaBrokers: string[]) {
    this.esClient = esClient;
    this.kafkaBrokers = kafkaBrokers;
  }

  async listContacts(tenantId: string, query: ContactListQuery): Promise<ContactListResult> {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));

    // Full-text search routes to Elasticsearch
    if (query.q) {
      const tags = query.tags ? query.tags.split(',').map((t) => t.trim()) : undefined;
      const result = await searchContacts(this.esClient, tenantId, query.q, {
        page,
        limit,
        ...(tags !== undefined ? { tags } : {}),
        ...(query.lifecycle_stage !== undefined ? { lifecycle_stage: query.lifecycle_stage } : {}),
        ...(query.lead_score_min !== undefined ? { lead_score_min: query.lead_score_min } : {}),
        ...(query.lead_score_max !== undefined ? { lead_score_max: query.lead_score_max } : {}),
      });

      // Map ES documents back to Contact shape
      const data = result.hits.map((h) => ({
        contact_id: h.contact_id,
        tenant_id: h.tenant_id,
        full_name: h.full_name,
        email: h.email,
        phone: h.phone,
        company_name: h.company_name,
        tags: h.tags,
        lifecycle_stage: h.lifecycle_stage,
        lead_score: h.lead_score,
        lead_score_confidence: h.lead_score_confidence,
        pii_erasure_requested_at: null,
        created_at: new Date(h.created_at),
        updated_at: new Date(h.updated_at),
      })) as Contact[];

      return { data, total: result.total, page, limit };
    }

    // Otherwise query PostgreSQL
    const db = getDb();
    const offset = (page - 1) * limit;

    const conditions = [
      eq(contacts.tenant_id, tenantId),
      isNull(contacts.pii_erasure_requested_at),
    ];

    if (query.lifecycle_stage) {
      conditions.push(eq(contacts.lifecycle_stage, query.lifecycle_stage));
    }

    const whereClause = and(...conditions);

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(contacts)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(contacts.created_at),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(contacts)
        .where(whereClause),
    ]);

    const total = countResult[0]?.count ?? 0;

    // Filter by tags in memory (PostgreSQL array overlap)
    let data = rows;
    if (query.tags) {
      const filterTags = query.tags.split(',').map((t) => t.trim());
      data = rows.filter((c) => filterTags.some((t) => c.tags.includes(t)));
    }
    if (query.lead_score_min !== undefined) {
      data = data.filter((c) => c.lead_score >= (query.lead_score_min ?? 0));
    }
    if (query.lead_score_max !== undefined) {
      data = data.filter((c) => c.lead_score <= (query.lead_score_max ?? 100));
    }

    return { data, total, page, limit };
  }

  async getContact(tenantId: string, contactId: string): Promise<Contact | null> {
    const db = getDb();
    const rows = await db
      .select()
      .from(contacts)
      .where(and(eq(contacts.tenant_id, tenantId), eq(contacts.contact_id, contactId)))
      .limit(1);
    return rows[0] ?? null;
  }

  async createContact(tenantId: string, userId: string, body: CreateContactBody): Promise<Contact> {
    if (body.email && !isValidEmail(body.email)) {
      throw new ValidationError('Invalid email format (RFC 5321)');
    }
    if (body.lead_score !== undefined && (body.lead_score < 0 || body.lead_score > 100)) {
      throw new ValidationError('lead_score must be between 0 and 100');
    }

    const db = getDb();
    const newContact: NewContact = {
      tenant_id: tenantId,
      full_name: body.full_name ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      company_name: body.company_name ?? null,
      tags: body.tags ?? [],
      lifecycle_stage: body.lifecycle_stage ?? null,
      lead_score: body.lead_score ?? 50,
      lead_score_confidence: body.lead_score_confidence ?? 'low',
    };

    const [contact] = await db.insert(contacts).values(newContact).returning();
    if (!contact) throw new Error('Failed to create contact');

    // Index in Elasticsearch asynchronously
    void this.indexContactAsync(contact);

    // Publish event
    void this.publishContactEvent('contact.created', tenantId, {
      contact_id: contact.contact_id,
      email: contact.email ?? '',
      full_name: contact.full_name ?? '',
    });

    return contact;
  }

  async updateContact(
    tenantId: string,
    contactId: string,
    body: UpdateContactBody,
  ): Promise<Contact | null> {
    if (body.email && !isValidEmail(body.email)) {
      throw new ValidationError('Invalid email format (RFC 5321)');
    }
    if (body.lead_score !== undefined && (body.lead_score < 0 || body.lead_score > 100)) {
      throw new ValidationError('lead_score must be between 0 and 100');
    }

    const db = getDb();
    const updates: Partial<NewContact> = {
      updated_at: new Date(),
    };

    if (body.full_name !== undefined) updates.full_name = body.full_name;
    if (body.email !== undefined) updates.email = body.email;
    if (body.phone !== undefined) updates.phone = body.phone;
    if (body.company_name !== undefined) updates.company_name = body.company_name;
    if (body.tags !== undefined) updates.tags = body.tags;
    if (body.lifecycle_stage !== undefined) updates.lifecycle_stage = body.lifecycle_stage;
    if (body.lead_score !== undefined) updates.lead_score = body.lead_score;
    if (body.lead_score_confidence !== undefined)
      updates.lead_score_confidence = body.lead_score_confidence;

    const [contact] = await db
      .update(contacts)
      .set(updates)
      .where(and(eq(contacts.tenant_id, tenantId), eq(contacts.contact_id, contactId)))
      .returning();

    if (!contact) return null;

    // Re-index in Elasticsearch
    void this.indexContactAsync(contact);

    // Publish event
    void this.publishContactEvent('contact.updated', tenantId, {
      contact_id: contact.contact_id,
      changed_fields: Object.keys(body),
    });

    return contact;
  }

  async deleteContact(tenantId: string, contactId: string): Promise<boolean> {
    const db = getDb();
    const now = new Date();

    const [contact] = await db
      .update(contacts)
      .set({ pii_erasure_requested_at: now, updated_at: now })
      .where(
        and(
          eq(contacts.tenant_id, tenantId),
          eq(contacts.contact_id, contactId),
          isNull(contacts.pii_erasure_requested_at),
        ),
      )
      .returning();

    if (!contact) return false;

    // Remove from Elasticsearch index
    void deleteContactFromIndex(this.esClient, contactId);

    // Publish event
    void this.publishContactEvent('contact.deleted', tenantId, {
      contact_id: contactId,
      pii_erasure_requested_at: now.toISOString(),
    });

    return true;
  }

  async deduplicateContacts(
    tenantId: string,
  ): Promise<{ merged_count: number; surviving_contact_ids: string[] }> {
    const db = getDb();

    // Find duplicate emails within the tenant
    const duplicates = await db.execute<{ email: string; ids: string[] }>(
      sql`
        SELECT email, array_agg(contact_id ORDER BY created_at ASC) AS ids
        FROM contacts
        WHERE tenant_id = ${tenantId}
          AND email IS NOT NULL
          AND pii_erasure_requested_at IS NULL
        GROUP BY email
        HAVING count(*) > 1
      `,
    );

    let mergedCount = 0;
    const survivingIds: string[] = [];

    for (const row of duplicates.rows) {
      const ids: string[] = row.ids;
      if (ids.length < 2) continue;

      // Keep the most recently updated record (last in array sorted by created_at = oldest first)
      // Actually we want most recent field values — keep the newest (last created)
      const survivorId = ids[ids.length - 1]!;
      const duplicateIds = ids.slice(0, -1);

      // Merge tags from all duplicates into survivor
      const allContacts = await db
        .select()
        .from(contacts)
        .where(inArray(contacts.contact_id, ids));

      const mergedTags = Array.from(new Set(allContacts.flatMap((c) => c.tags)));

      // Update survivor with merged tags
      await db
        .update(contacts)
        .set({ tags: mergedTags, updated_at: new Date() })
        .where(eq(contacts.contact_id, survivorId));

      // Soft-delete duplicates
      const now = new Date();
      await db
        .update(contacts)
        .set({ pii_erasure_requested_at: now, updated_at: now })
        .where(inArray(contacts.contact_id, duplicateIds));

      mergedCount += duplicateIds.length;
      survivingIds.push(survivorId);
    }

    return { merged_count: mergedCount, surviving_contact_ids: survivingIds };
  }

  private async indexContactAsync(contact: Contact): Promise<void> {
    try {
      await indexContact(this.esClient, contact);
    } catch (err) {
      console.error('Failed to index contact in Elasticsearch:', err);
    }
  }

  private async publishContactEvent(
    type: 'contact.created' | 'contact.updated' | 'contact.deleted',
    tenantId: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    try {
      const publisher = createPublisher(tenantId, { brokers: this.kafkaBrokers });
      await publisher.connect();
      await publisher.publish('contacts', type, payload as never);
      await publisher.disconnect();
    } catch (err) {
      console.error(`Failed to publish ${type} event:`, err);
    }
  }

  /** Scheduled job: purge PII fields for contacts where erasure was requested > 30 days ago */
  async purgePiiFields(): Promise<number> {
    const db = getDb();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const result = await db
      .update(contacts)
      .set({
        full_name: null,
        email: null,
        phone: null,
        company_name: null,
        updated_at: new Date(),
      })
      .where(
        and(
          sql`pii_erasure_requested_at IS NOT NULL`,
          sql`pii_erasure_requested_at <= ${thirtyDaysAgo.toISOString()}`,
          sql`(full_name IS NOT NULL OR email IS NOT NULL OR phone IS NOT NULL OR company_name IS NOT NULL)`,
        ),
      )
      .returning({ contact_id: contacts.contact_id });

    return result.length;
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
