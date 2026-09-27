/**
 * Team Inbox Service — core business logic.
 * Requirements: 20.1–20.7
 */
import { eq, and, asc, desc, ilike, gte, lte, SQL } from 'drizzle-orm';
import {
  getDb,
  inboxConversations,
  type InboxConversation,
  type NewInboxConversation,
} from '@platform/db';

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type InboxChannel = 'email' | 'sms' | 'live_chat' | 'whatsapp' | 'facebook';
export type InboxStatus = 'open' | 'pending' | 'resolved' | 'snoozed';

export interface CreateInboxConversationInput {
  channel: InboxChannel;
  contact_id?: string | undefined;
  contact_name?: string | undefined;
  last_message_preview?: string | undefined;
}

export interface ListInboxQuery {
  channel?: InboxChannel | undefined;
  status?: InboxStatus | undefined;
  assigned_to?: string | undefined;
  q?: string | undefined;
  from?: string | undefined;
  to?: string | undefined;
}

// ─── Create / upsert ─────────────────────────────────────────────────────────

export async function createInboxConversation(
  tenantId: string,
  input: CreateInboxConversationInput,
): Promise<InboxConversation> {
  if (!input.channel) throw new ValidationError('channel is required');

  const db = getDb();
  const now = new Date();

  const newConv: NewInboxConversation = {
    tenant_id: tenantId,
    channel: input.channel,
    contact_id: input.contact_id ?? null,
    contact_name: input.contact_name ?? null,
    last_message_preview: input.last_message_preview ?? null,
    last_message_at: now,
    assigned_to: null,
    status: 'open',
  };

  const [conv] = await db.insert(inboxConversations).values(newConv).returning();
  if (!conv) throw new Error('Failed to create inbox conversation');
  return conv;
}

export async function getInboxConversation(
  tenantId: string,
  inboxId: string,
): Promise<InboxConversation> {
  const db = getDb();
  const [conv] = await db
    .select()
    .from(inboxConversations)
    .where(
      and(
        eq(inboxConversations.tenant_id, tenantId),
        eq(inboxConversations.inbox_id, inboxId),
      ),
    )
    .limit(1);

  if (!conv) throw new NotFoundError('Inbox conversation not found');
  return conv;
}

// ─── List with filtering ──────────────────────────────────────────────────────

export async function listInboxConversations(
  tenantId: string,
  query: ListInboxQuery,
): Promise<InboxConversation[]> {
  const db = getDb();

  const conditions: SQL[] = [eq(inboxConversations.tenant_id, tenantId)];

  if (query.channel) {
    conditions.push(eq(inboxConversations.channel, query.channel));
  }
  if (query.status) {
    conditions.push(eq(inboxConversations.status, query.status));
  }
  if (query.assigned_to) {
    conditions.push(eq(inboxConversations.assigned_to, query.assigned_to));
  }
  if (query.q) {
    conditions.push(ilike(inboxConversations.contact_name, `%${query.q}%`));
  }
  if (query.from) {
    conditions.push(gte(inboxConversations.last_message_at, new Date(query.from)));
  }
  if (query.to) {
    conditions.push(lte(inboxConversations.last_message_at, new Date(query.to)));
  }

  const whereClause = conditions.length === 1 ? conditions[0]! : and(...conditions)!;

  return db
    .select()
    .from(inboxConversations)
    .where(whereClause)
    .orderBy(desc(inboxConversations.last_message_at));
}

// ─── Assignment ───────────────────────────────────────────────────────────────

export async function assignConversation(
  tenantId: string,
  inboxId: string,
  userId: string,
): Promise<InboxConversation> {
  if (!userId) throw new ValidationError('user_id is required');

  const db = getDb();
  await getInboxConversation(tenantId, inboxId);

  const [updated] = await db
    .update(inboxConversations)
    .set({ assigned_to: userId })
    .where(
      and(
        eq(inboxConversations.tenant_id, tenantId),
        eq(inboxConversations.inbox_id, inboxId),
      ),
    )
    .returning();

  if (!updated) throw new Error('Failed to assign conversation');
  return updated;
}

// ─── Status transitions ───────────────────────────────────────────────────────

export async function updateConversationStatus(
  tenantId: string,
  inboxId: string,
  status: InboxStatus,
): Promise<InboxConversation> {
  const validStatuses: InboxStatus[] = ['open', 'pending', 'resolved', 'snoozed'];
  if (!validStatuses.includes(status)) {
    throw new ValidationError(`Invalid status: ${status}`);
  }

  const db = getDb();
  await getInboxConversation(tenantId, inboxId);

  const [updated] = await db
    .update(inboxConversations)
    .set({ status })
    .where(
      and(
        eq(inboxConversations.tenant_id, tenantId),
        eq(inboxConversations.inbox_id, inboxId),
      ),
    )
    .returning();

  if (!updated) throw new Error('Failed to update conversation status');
  return updated;
}

// ─── Auto-reopen on new inbound message ──────────────────────────────────────

export async function touchConversation(
  tenantId: string,
  inboxId: string,
  preview: string,
): Promise<InboxConversation> {
  const db = getDb();
  const conv = await getInboxConversation(tenantId, inboxId);

  // Auto-reopen resolved conversations on new inbound message
  const newStatus: InboxStatus = conv.status === 'resolved' ? 'open' : conv.status;

  const [updated] = await db
    .update(inboxConversations)
    .set({
      last_message_preview: preview,
      last_message_at: new Date(),
      status: newStatus,
      // Clear assignment when auto-reopened
      assigned_to: conv.status === 'resolved' ? null : conv.assigned_to,
    })
    .where(
      and(
        eq(inboxConversations.tenant_id, tenantId),
        eq(inboxConversations.inbox_id, inboxId),
      ),
    )
    .returning();

  if (!updated) throw new Error('Failed to touch conversation');
  return updated;
}
