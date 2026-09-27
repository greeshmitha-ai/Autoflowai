import { eq, and } from 'drizzle-orm';
import { getDb, agents, conversations, knowledgeBase } from '@platform/db';
import type { Agent, NewAgent, Conversation, NewConversation } from '@platform/db';

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

// ─── Agent CRUD ───────────────────────────────────────────────────────────────

export async function createAgent(
  tenantId: string,
  data: {
    name: string;
    persona?: string;
    escalation_threshold?: number;
    deployment_targets?: string[];
  },
): Promise<Agent> {
  if (!data.name?.trim()) throw new ValidationError('name is required');

  const db = getDb();
  const [agent] = await db
    .insert(agents)
    .values({
      tenant_id: tenantId,
      name: data.name.trim(),
      persona: data.persona ?? '',
      escalation_threshold: data.escalation_threshold ?? 0.5,
      deployment_targets: data.deployment_targets ?? [],
    } satisfies NewAgent)
    .returning();

  return agent!;
}

export async function updateAgent(
  tenantId: string,
  agentId: string,
  data: Partial<{
    name: string;
    persona: string;
    escalation_threshold: number;
    deployment_targets: string[];
  }>,
): Promise<Agent> {
  const db = getDb();

  const existing = await db.query.agents.findFirst({
    where: and(eq(agents.agent_id, agentId), eq(agents.tenant_id, tenantId)),
  });
  if (!existing) throw new NotFoundError('Agent not found');

  const [updated] = await db
    .update(agents)
    .set({
      ...(data.name !== undefined && { name: data.name }),
      ...(data.persona !== undefined && { persona: data.persona }),
      ...(data.escalation_threshold !== undefined && {
        escalation_threshold: data.escalation_threshold,
      }),
      ...(data.deployment_targets !== undefined && {
        deployment_targets: data.deployment_targets,
      }),
    })
    .where(and(eq(agents.agent_id, agentId), eq(agents.tenant_id, tenantId)))
    .returning();

  return updated!;
}

export async function getAgent(tenantId: string, agentId: string): Promise<Agent> {
  const db = getDb();
  const agent = await db.query.agents.findFirst({
    where: and(eq(agents.agent_id, agentId), eq(agents.tenant_id, tenantId)),
  });
  if (!agent) throw new NotFoundError('Agent not found');
  return agent;
}

// ─── Conversation CRUD ────────────────────────────────────────────────────────

export async function createConversation(
  tenantId: string,
  data: {
    agent_id?: string | null;
    contact_id?: string | null;
    channel?: 'widget' | 'whatsapp' | 'facebook' | 'sms' | 'live_chat';
  },
): Promise<Conversation> {
  const db = getDb();
  const [conv] = await db
    .insert(conversations)
    .values({
      tenant_id: tenantId,
      agent_id: data.agent_id ?? null,
      contact_id: data.contact_id ?? null,
      channel: data.channel ?? 'widget',
      status: 'open',
      transcript: [],
    } satisfies NewConversation)
    .returning();

  return conv!;
}

export async function getConversation(
  tenantId: string,
  conversationId: string,
): Promise<Conversation> {
  const db = getDb();
  const conv = await db.query.conversations.findFirst({
    where: and(
      eq(conversations.conversation_id, conversationId),
      eq(conversations.tenant_id, tenantId),
    ),
  });
  if (!conv) throw new NotFoundError('Conversation not found');
  return conv;
}

export async function appendTranscript(
  tenantId: string,
  conversationId: string,
  entry: { role: 'user' | 'assistant' | 'system'; content: string; confidence?: number },
): Promise<Conversation> {
  const db = getDb();
  const conv = await getConversation(tenantId, conversationId);

  const newEntry = {
    role: entry.role,
    content: entry.content,
    timestamp: new Date().toISOString(),
    ...(entry.confidence !== undefined && { confidence: entry.confidence }),
  };

  const updatedTranscript = [...(conv.transcript ?? []), newEntry];

  const [updated] = await db
    .update(conversations)
    .set({ transcript: updatedTranscript })
    .where(
      and(
        eq(conversations.conversation_id, conversationId),
        eq(conversations.tenant_id, tenantId),
      ),
    )
    .returning();

  return updated!;
}

export async function escalateConversation(
  tenantId: string,
  conversationId: string,
): Promise<Conversation> {
  const db = getDb();
  const [updated] = await db
    .update(conversations)
    .set({ status: 'escalated' })
    .where(
      and(
        eq(conversations.conversation_id, conversationId),
        eq(conversations.tenant_id, tenantId),
      ),
    )
    .returning();

  if (!updated) throw new NotFoundError('Conversation not found');
  return updated;
}

export async function closeConversation(
  tenantId: string,
  conversationId: string,
): Promise<Conversation> {
  const db = getDb();
  const [updated] = await db
    .update(conversations)
    .set({ status: 'closed', closed_at: new Date() })
    .where(
      and(
        eq(conversations.conversation_id, conversationId),
        eq(conversations.tenant_id, tenantId),
      ),
    )
    .returning();

  if (!updated) throw new NotFoundError('Conversation not found');
  return updated;
}

// ─── Knowledge Base ───────────────────────────────────────────────────────────

export async function createKnowledgeBaseEntry(
  tenantId: string,
  agentId: string,
  filename: string,
  s3Key: string,
): Promise<typeof knowledgeBase.$inferSelect> {
  const db = getDb();
  const [entry] = await db
    .insert(knowledgeBase)
    .values({
      tenant_id: tenantId,
      agent_id: agentId,
      filename,
      s3_key: s3Key,
      status: 'pending',
    })
    .returning();

  return entry!;
}

export async function markKnowledgeBaseIndexed(kbId: string): Promise<void> {
  const db = getDb();
  await db
    .update(knowledgeBase)
    .set({ status: 'indexed', indexed_at: new Date() })
    .where(eq(knowledgeBase.kb_id, kbId));
}
