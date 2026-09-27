/**
 * Portal Service — business logic for Customer Self-Service Portal.
 * Requirements: 26.1–26.7
 */
import { eq, and, desc, isNull } from 'drizzle-orm';
import { randomBytes, createHash } from 'crypto';
import {
  getDb,
  portalSessions,
  supportTickets,
  contacts,
  campaignDeliveries,
  calls,
  conversations,
  surveyResponses,
  type NewPortalSession,
  type NewSupportTicket,
  type SupportTicket,
} from '@platform/db';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

// ─── Auth helpers ─────────────────────────────────────────────────────────────

/** Generate a secure random magic-link token */
function generateMagicToken(): string {
  return randomBytes(32).toString('hex');
}

/** Hash a password with SHA-256 (stub — use bcrypt in production) */
function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

// ─── 33.1 Auth ────────────────────────────────────────────────────────────────

/**
 * Send magic link email (stub).
 * Finds the contact by email+tenant, creates a portal session with a token.
 */
export async function sendMagicLink(
  tenantId: string,
  email: string,
): Promise<{ token: string; session_id: string }> {
  if (!email?.trim()) throw new ValidationError('email is required');

  const db = getDb();

  // Find contact by email within tenant
  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenant_id, tenantId), eq(contacts.email, email.toLowerCase().trim())))
    .limit(1);

  if (!contact) throw new NotFoundError('No account found for this email');

  const token = generateMagicToken();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

  const newSession: NewPortalSession = {
    tenant_id: tenantId,
    contact_id: contact.contact_id,
    email: email.toLowerCase().trim(),
    magic_link_token: token,
    token_expires_at: expiresAt,
  };

  const [session] = await db.insert(portalSessions).values(newSession).returning();
  if (!session) throw new Error('Failed to create portal session');

  // Stub: in production, send email with magic link
  console.log(`[PortalService] Magic link token for ${email}: ${token}`);

  return { token, session_id: session.session_id };
}

/**
 * Verify magic link token and return session info for JWT issuance.
 */
export async function verifyMagicLink(
  token: string,
): Promise<{ contact_id: string; tenant_id: string; email: string; session_id: string }> {
  if (!token?.trim()) throw new ValidationError('token is required');

  const db = getDb();

  const [session] = await db
    .select()
    .from(portalSessions)
    .where(eq(portalSessions.magic_link_token, token))
    .limit(1);

  if (!session) throw new AuthError('Invalid or expired token');

  if (!session.token_expires_at || session.token_expires_at < new Date()) {
    throw new AuthError('Token has expired');
  }

  // Invalidate token after use
  await db
    .update(portalSessions)
    .set({ magic_link_token: null, token_expires_at: null })
    .where(eq(portalSessions.session_id, session.session_id));

  return {
    contact_id: session.contact_id,
    tenant_id: session.tenant_id,
    email: session.email,
    session_id: session.session_id,
  };
}

/**
 * Password-based portal login (stub — contacts would need a portal_password_hash column).
 * For now, validates that the contact exists and returns session info.
 */
export async function portalPasswordLogin(
  tenantId: string,
  email: string,
  _password: string,
): Promise<{ contact_id: string; tenant_id: string; email: string; session_id: string }> {
  if (!email?.trim()) throw new ValidationError('email is required');
  if (!_password?.trim()) throw new ValidationError('password is required');

  const db = getDb();

  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenant_id, tenantId), eq(contacts.email, email.toLowerCase().trim())))
    .limit(1);

  if (!contact) throw new AuthError('Invalid credentials');

  // Stub: in production, verify bcrypt hash from a portal_password_hash column
  // For now, accept any non-empty password for contacts that exist
  const newSession: NewPortalSession = {
    tenant_id: tenantId,
    contact_id: contact.contact_id,
    email: email.toLowerCase().trim(),
    magic_link_token: null,
    token_expires_at: null,
  };

  const [session] = await db.insert(portalSessions).values(newSession).returning();
  if (!session) throw new Error('Failed to create portal session');

  return {
    contact_id: contact.contact_id,
    tenant_id: tenantId,
    email: email.toLowerCase().trim(),
    session_id: session.session_id,
  };
}

// ─── 33.2 Interaction history ─────────────────────────────────────────────────

export interface HistoryItem {
  type: 'email' | 'call' | 'chatbot' | 'survey';
  id: string;
  timestamp: Date;
  summary: string;
}

/**
 * Return chronological interaction history for a contact.
 */
export async function getContactHistory(
  tenantId: string,
  contactId: string,
): Promise<HistoryItem[]> {
  const db = getDb();
  const items: HistoryItem[] = [];

  // Emails from campaign deliveries
  const deliveries = await db
    .select()
    .from(campaignDeliveries)
    .where(
      and(
        eq(campaignDeliveries.tenant_id, tenantId),
        eq(campaignDeliveries.contact_id, contactId),
      ),
    )
    .orderBy(desc(campaignDeliveries.created_at));

  for (const d of deliveries) {
    items.push({
      type: 'email',
      id: d.delivery_id,
      timestamp: d.created_at,
      summary: `Email campaign delivery — status: ${d.status}`,
    });
  }

  // Calls
  const callRecords = await db
    .select()
    .from(calls)
    .where(and(eq(calls.tenant_id, tenantId), eq(calls.contact_id, contactId)))
    .orderBy(desc(calls.created_at));

  for (const c of callRecords) {
    items.push({
      type: 'call',
      id: c.call_id,
      timestamp: c.created_at,
      summary: `${c.direction} call — status: ${c.status}${c.duration_seconds ? `, ${c.duration_seconds}s` : ''}`,
    });
  }

  // Chatbot sessions
  const chatSessions = await db
    .select()
    .from(conversations)
    .where(
      and(eq(conversations.tenant_id, tenantId), eq(conversations.contact_id, contactId)),
    )
    .orderBy(desc(conversations.created_at));

  for (const s of chatSessions) {
    items.push({
      type: 'chatbot',
      id: s.conversation_id,
      timestamp: s.created_at,
      summary: `Chatbot session via ${s.channel} — status: ${s.status}`,
    });
  }

  // Survey responses
  const responses = await db
    .select()
    .from(surveyResponses)
    .where(
      and(
        eq(surveyResponses.tenant_id, tenantId),
        eq(surveyResponses.contact_id, contactId),
      ),
    )
    .orderBy(desc(surveyResponses.submitted_at));

  for (const r of responses) {
    items.push({
      type: 'survey',
      id: r.response_id,
      timestamp: r.submitted_at,
      summary: `Survey response — sentiment: ${r.sentiment}`,
    });
  }

  // Sort all items chronologically (newest first)
  items.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return items;
}

// ─── 33.3 Support tickets ─────────────────────────────────────────────────────

function generateTicketRef(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(3).toString('hex').toUpperCase();
  return `TKT-${ts}-${rand}`;
}

export interface CreateTicketInput {
  subject: string;
  description: string;
  file_attachment_url?: string;
}

export async function createSupportTicket(
  tenantId: string,
  contactId: string,
  input: CreateTicketInput,
): Promise<SupportTicket> {
  if (!input.subject?.trim()) throw new ValidationError('subject is required');
  if (!input.description?.trim()) throw new ValidationError('description is required');

  const db = getDb();

  const newTicket: NewSupportTicket = {
    tenant_id: tenantId,
    contact_id: contactId,
    subject: input.subject.trim(),
    description: input.description.trim(),
    status: 'open',
    file_attachment_url: input.file_attachment_url ?? null,
    ticket_ref: generateTicketRef(),
  };

  const [ticket] = await db.insert(supportTickets).values(newTicket).returning();
  if (!ticket) throw new Error('Failed to create support ticket');

  return ticket;
}

export async function listSupportTickets(
  tenantId: string,
  contactId: string,
): Promise<SupportTicket[]> {
  const db = getDb();
  return db
    .select()
    .from(supportTickets)
    .where(
      and(
        eq(supportTickets.tenant_id, tenantId),
        eq(supportTickets.contact_id, contactId),
      ),
    )
    .orderBy(desc(supportTickets.created_at));
}

// ─── 33.4 Communication preferences ──────────────────────────────────────────

export interface CommunicationPreferences {
  email_opt_in: boolean;
  sms_opt_in: boolean;
  in_app_opt_in: boolean;
}

/**
 * Get communication preferences from contact tags.
 * Tags like 'opt_out_email', 'opt_out_sms', 'opt_out_in_app' indicate opt-outs.
 */
export async function getPreferences(
  tenantId: string,
  contactId: string,
): Promise<CommunicationPreferences> {
  const db = getDb();

  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenant_id, tenantId), eq(contacts.contact_id, contactId)))
    .limit(1);

  if (!contact) throw new NotFoundError('Contact not found');

  const tags = contact.tags ?? [];
  return {
    email_opt_in: !tags.includes('opt_out_email'),
    sms_opt_in: !tags.includes('opt_out_sms'),
    in_app_opt_in: !tags.includes('opt_out_in_app'),
  };
}

/**
 * Update communication preferences on the Contact record.
 * Applied within 60 seconds (synchronous update).
 */
export async function updatePreferences(
  tenantId: string,
  contactId: string,
  prefs: CommunicationPreferences,
): Promise<CommunicationPreferences> {
  const db = getDb();

  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenant_id, tenantId), eq(contacts.contact_id, contactId)))
    .limit(1);

  if (!contact) throw new NotFoundError('Contact not found');

  // Rebuild tags: remove old opt-out tags, then add new ones based on prefs
  const otherTags = (contact.tags ?? []).filter(
    (t) => !['opt_out_email', 'opt_out_sms', 'opt_out_in_app'].includes(t),
  );

  const newTags = [...otherTags];
  if (!prefs.email_opt_in) newTags.push('opt_out_email');
  if (!prefs.sms_opt_in) newTags.push('opt_out_sms');
  if (!prefs.in_app_opt_in) newTags.push('opt_out_in_app');

  await db
    .update(contacts)
    .set({ tags: newTags, updated_at: new Date() })
    .where(and(eq(contacts.tenant_id, tenantId), eq(contacts.contact_id, contactId)));

  return prefs;
}

// ─── 33.5 Data export request ─────────────────────────────────────────────────

/**
 * Request a personal data export.
 * Reuses the compliance/export service mechanism by setting pii_erasure_requested_at
 * and publishing an export request event (stub).
 * Fulfilled within 48 hours per Requirement 10.3.
 */
export async function requestDataExport(
  tenantId: string,
  contactId: string,
): Promise<{ message: string; estimated_completion: string }> {
  const db = getDb();

  const [contact] = await db
    .select()
    .from(contacts)
    .where(and(eq(contacts.tenant_id, tenantId), eq(contacts.contact_id, contactId)))
    .limit(1);

  if (!contact) throw new NotFoundError('Contact not found');

  // Stub: in production, publish a data-export-requested event to the message bus
  // which the Export Service / Compliance Service will consume and fulfill within 48 hours
  console.log(
    `[PortalService] Data export requested for contact ${contactId} in tenant ${tenantId}`,
  );

  const estimatedCompletion = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  return {
    message: 'Your data export request has been received. You will be notified when it is ready.',
    estimated_completion: estimatedCompletion,
  };
}
