/**
 * Live Chat Service — core business logic.
 * Requirements: 19.1–19.7
 */
import { eq, and, asc } from 'drizzle-orm';
import {
  getDb,
  liveChatSessions,
  liveChatMessages,
  cannedResponses,
  conversations,
  contacts,
  type LiveChatSession,
  type NewLiveChatSession,
  type LiveChatMessage,
  type NewLiveChatMessage,
  type CannedResponse,
  type NewCannedResponse,
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

// ─── Session management ───────────────────────────────────────────────────────

export interface CreateSessionInput {
  conversation_id?: string | undefined;
  contact_id?: string | undefined;
}

export async function createSession(
  tenantId: string,
  input: CreateSessionInput,
): Promise<LiveChatSession> {
  const db = getDb();
  const newSession: NewLiveChatSession = {
    tenant_id: tenantId,
    conversation_id: input.conversation_id ?? null,
    contact_id: input.contact_id ?? null,
    assigned_operator_id: null,
    status: 'waiting',
  };

  const [session] = await db.insert(liveChatSessions).values(newSession).returning();
  if (!session) throw new Error('Failed to create live chat session');
  return session;
}

export async function getSession(
  tenantId: string,
  sessionId: string,
): Promise<LiveChatSession> {
  const db = getDb();
  const [session] = await db
    .select()
    .from(liveChatSessions)
    .where(
      and(
        eq(liveChatSessions.tenant_id, tenantId),
        eq(liveChatSessions.session_id, sessionId),
      ),
    )
    .limit(1);

  if (!session) throw new NotFoundError('Live chat session not found');
  return session;
}

export async function assignOperator(
  tenantId: string,
  sessionId: string,
  operatorId: string,
): Promise<LiveChatSession> {
  const db = getDb();
  const session = await getSession(tenantId, sessionId);

  if (session.status !== 'waiting') {
    throw new ValidationError('Session is not in waiting state');
  }

  const [updated] = await db
    .update(liveChatSessions)
    .set({ assigned_operator_id: operatorId, status: 'active' })
    .where(
      and(
        eq(liveChatSessions.tenant_id, tenantId),
        eq(liveChatSessions.session_id, sessionId),
        eq(liveChatSessions.status, 'waiting'),
      ),
    )
    .returning();

  if (!updated) throw new ValidationError('Session already assigned or not found');
  return updated;
}

export async function closeSession(
  tenantId: string,
  sessionId: string,
): Promise<LiveChatSession> {
  const db = getDb();
  await getSession(tenantId, sessionId);

  const [updated] = await db
    .update(liveChatSessions)
    .set({ status: 'closed', closed_at: new Date() })
    .where(
      and(
        eq(liveChatSessions.tenant_id, tenantId),
        eq(liveChatSessions.session_id, sessionId),
      ),
    )
    .returning();

  if (!updated) throw new Error('Failed to close session');
  return updated;
}

// ─── Session context (transcript + contact summary + lead score) ──────────────

export interface SessionContext {
  session: LiveChatSession;
  messages: LiveChatMessage[];
  prior_transcript: unknown[] | null;
  contact: {
    contact_id: string;
    full_name: string | null;
    email: string | null;
    phone: string | null;
    company_name: string | null;
    lead_score: number | null;
    lead_score_confidence: string | null;
    lifecycle_stage: string | null;
    tags: string[] | null;
  } | null;
}

export async function getSessionContext(
  tenantId: string,
  sessionId: string,
): Promise<SessionContext> {
  const db = getDb();
  const session = await getSession(tenantId, sessionId);

  // Load messages for this session
  const messages = await db
    .select()
    .from(liveChatMessages)
    .where(
      and(
        eq(liveChatMessages.tenant_id, tenantId),
        eq(liveChatMessages.session_id, sessionId),
      ),
    )
    .orderBy(asc(liveChatMessages.sent_at));

  // Load prior chatbot transcript if conversation_id is set
  let prior_transcript: unknown[] | null = null;
  if (session.conversation_id) {
    const [conv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.conversation_id, session.conversation_id))
      .limit(1);
    if (conv) {
      prior_transcript = conv.transcript as unknown[];
    }
  }

  // Load contact summary with lead score
  let contact: SessionContext['contact'] = null;
  if (session.contact_id) {
    const [c] = await db
      .select()
      .from(contacts)
      .where(eq(contacts.contact_id, session.contact_id))
      .limit(1);
    if (c) {
      contact = {
        contact_id: c.contact_id,
        full_name: c.full_name,
        email: c.email,
        phone: c.phone,
        company_name: c.company_name,
        lead_score: c.lead_score,
        lead_score_confidence: c.lead_score_confidence,
        lifecycle_stage: c.lifecycle_stage,
        tags: c.tags,
      };
    }
  }

  return { session, messages, prior_transcript, contact };
}

// ─── Messages ─────────────────────────────────────────────────────────────────

export async function addMessage(
  tenantId: string,
  sessionId: string,
  senderType: 'customer' | 'operator' | 'system',
  senderId: string,
  content: string,
): Promise<LiveChatMessage> {
  if (!content?.trim()) throw new ValidationError('content is required');

  const db = getDb();
  // Verify session exists and belongs to tenant
  await getSession(tenantId, sessionId);

  const newMsg: NewLiveChatMessage = {
    session_id: sessionId,
    tenant_id: tenantId,
    sender_type: senderType,
    sender_id: senderId,
    content: content.trim(),
    sent_at: new Date(),
  };

  const [msg] = await db.insert(liveChatMessages).values(newMsg).returning();
  if (!msg) throw new Error('Failed to store message');
  return msg;
}

// ─── Canned Responses ─────────────────────────────────────────────────────────

export interface CreateCannedResponseInput {
  title: string;
  content: string;
}

export async function createCannedResponse(
  tenantId: string,
  createdBy: string,
  input: CreateCannedResponseInput,
): Promise<CannedResponse> {
  if (!input.title?.trim()) throw new ValidationError('title is required');
  if (!input.content?.trim()) throw new ValidationError('content is required');

  const db = getDb();
  const newCanned: NewCannedResponse = {
    tenant_id: tenantId,
    title: input.title.trim(),
    content: input.content.trim(),
    created_by: createdBy,
  };

  const [canned] = await db.insert(cannedResponses).values(newCanned).returning();
  if (!canned) throw new Error('Failed to create canned response');
  return canned;
}

export async function listCannedResponses(tenantId: string): Promise<CannedResponse[]> {
  const db = getDb();
  return db
    .select()
    .from(cannedResponses)
    .where(eq(cannedResponses.tenant_id, tenantId))
    .orderBy(asc(cannedResponses.title));
}
