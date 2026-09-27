/**
 * Collaboration Service — internal notes, @mention detection, assignments, and activity feed.
 * Requirements: 21.1–21.6
 */
import { eq, and, desc, or, ilike } from 'drizzle-orm';
import {
  getDb,
  internalNotes,
  assignments,
  users,
  type InternalNote,
  type NewInternalNote,
  type Assignment,
  type NewAssignment,
  type User,
} from '@platform/db';
import { createPublisher } from '@platform/events';

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

export type ResourceType = 'contact' | 'deal' | 'conversation';

// ─── @mention parser ──────────────────────────────────────────────────────────

/**
 * Extract @username mentions from note content.
 * Pattern: @word (alphanumeric + underscore, min 1 char)
 */
export function parseMentions(content: string): string[] {
  const pattern = /@([\w]+)/g;
  const mentions: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const username = match[1];
    if (username) mentions.push(username);
  }
  // deduplicate
  return [...new Set(mentions)];
}

// ─── Internal Notes ───────────────────────────────────────────────────────────

export interface CreateNoteInput {
  content: string;
}

export async function createNote(
  tenantId: string,
  userId: string,
  resourceType: ResourceType,
  resourceId: string,
  input: CreateNoteInput,
  kafkaBrokers: string[],
): Promise<InternalNote> {
  if (!input.content?.trim()) throw new ValidationError('content is required');

  const db = getDb();
  const newNote: NewInternalNote = {
    tenant_id: tenantId,
    resource_type: resourceType,
    resource_id: resourceId,
    content: input.content.trim(),
    created_by: userId,
  };

  const [note] = await db.insert(internalNotes).values(newNote).returning();
  if (!note) throw new Error('Failed to create note');

  // Detect @mentions and publish event within 5 seconds (Req 21.2)
  const mentions = parseMentions(note.content);
  if (mentions.length > 0) {
    try {
      const publisher = createPublisher(tenantId, { brokers: kafkaBrokers });
      await publisher.connect();
      await publisher.publish('collaboration', 'collaboration.mention', {
        note_id: note.note_id,
        resource_type: resourceType,
        resource_id: resourceId,
        mentioned_usernames: mentions,
        mentioned_by: userId,
        content_preview: note.content.slice(0, 200),
      });
      await publisher.disconnect();
    } catch (err) {
      console.error('[CollaborationService] Failed to publish mention event:', err);
    }
  }

  return note;
}

export async function listNotes(
  tenantId: string,
  resourceType: ResourceType,
  resourceId: string,
): Promise<InternalNote[]> {
  const db = getDb();
  return db
    .select()
    .from(internalNotes)
    .where(
      and(
        eq(internalNotes.tenant_id, tenantId),
        eq(internalNotes.resource_type, resourceType),
        eq(internalNotes.resource_id, resourceId),
      ),
    )
    .orderBy(desc(internalNotes.created_at));
}

// ─── Assignments ──────────────────────────────────────────────────────────────

export interface AssignResourceInput {
  assigned_to: string;
}

export async function assignResource(
  tenantId: string,
  assignedBy: string,
  resourceType: ResourceType,
  resourceId: string,
  input: AssignResourceInput,
  kafkaBrokers: string[],
): Promise<Assignment> {
  if (!input.assigned_to) throw new ValidationError('assigned_to is required');

  const db = getDb();
  const newAssignment: NewAssignment = {
    tenant_id: tenantId,
    resource_type: resourceType,
    resource_id: resourceId,
    assigned_by: assignedBy,
    assigned_to: input.assigned_to,
  };

  const [assignment] = await db.insert(assignments).values(newAssignment).returning();
  if (!assignment) throw new Error('Failed to create assignment');

  // Publish assignment event to notify receiving user (Req 21.4)
  try {
    const publisher = createPublisher(tenantId, { brokers: kafkaBrokers });
    await publisher.connect();
    await publisher.publish('collaboration', 'collaboration.assigned', {
      assignment_id: assignment.assignment_id,
      resource_type: resourceType,
      resource_id: resourceId,
      assigned_by: assignedBy,
      assigned_to: input.assigned_to,
      assigned_at: assignment.assigned_at.toISOString(),
    });
    await publisher.disconnect();
  } catch (err) {
    console.error('[CollaborationService] Failed to publish assignment event:', err);
  }

  return assignment;
}

// ─── Activity Feed ────────────────────────────────────────────────────────────

export type ActivityType = 'note' | 'assignment';

export interface ActivityFeedItem {
  type: ActivityType;
  timestamp: Date;
  data: InternalNote | Assignment;
}

/**
 * Aggregate internal notes and assignments for a resource in chronological order.
 * Requirements: 21.5
 */
export async function getActivityFeed(
  tenantId: string,
  resourceType: ResourceType,
  resourceId: string,
): Promise<ActivityFeedItem[]> {
  const db = getDb();

  const [noteRows, assignmentRows] = await Promise.all([
    db
      .select()
      .from(internalNotes)
      .where(
        and(
          eq(internalNotes.tenant_id, tenantId),
          eq(internalNotes.resource_type, resourceType),
          eq(internalNotes.resource_id, resourceId),
        ),
      ),
    db
      .select()
      .from(assignments)
      .where(
        and(
          eq(assignments.tenant_id, tenantId),
          eq(assignments.resource_type, resourceType),
          eq(assignments.resource_id, resourceId),
        ),
      ),
  ]);

  const items: ActivityFeedItem[] = [
    ...noteRows.map((n) => ({ type: 'note' as const, timestamp: n.created_at, data: n })),
    ...assignmentRows.map((a) => ({
      type: 'assignment' as const,
      timestamp: a.assigned_at,
      data: a,
    })),
  ];

  // Sort chronologically (oldest first)
  items.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return items;
}

// ─── User Autocomplete ────────────────────────────────────────────────────────

export interface UserSuggestion {
  user_id: string;
  email: string;
  roles: string[];
}

/**
 * Return active users within the same tenant matching the query.
 * Requirements: 21.6
 */
export async function autocompleteUsers(
  tenantId: string,
  q: string,
): Promise<UserSuggestion[]> {
  const db = getDb();

  const conditions = [
    eq(users.tenant_id, tenantId),
    eq(users.status, 'active'),
  ];

  if (q.trim()) {
    conditions.push(ilike(users.email, `%${q.trim()}%`));
  }

  const rows = await db
    .select({
      user_id: users.user_id,
      email: users.email,
      roles: users.roles,
    })
    .from(users)
    .where(and(...conditions))
    .limit(20);

  return rows;
}
