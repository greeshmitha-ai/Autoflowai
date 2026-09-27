import { eq, and } from 'drizzle-orm';
import { getDb, calls, contacts } from '@platform/db';
import type { Call, NewCall } from '@platform/db';

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

/** E.164 phone number validation */
export function isValidE164(phone: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(phone);
}

export async function createCall(tenantId: string, data: Omit<NewCall, 'call_id' | 'tenant_id' | 'created_at'>): Promise<Call> {
  const db = getDb();
  const [call] = await db
    .insert(calls)
    .values({ ...data, tenant_id: tenantId })
    .returning();
  if (!call) throw new Error('Failed to create call record');
  return call;
}

export async function getCall(tenantId: string, callId: string): Promise<Call> {
  const db = getDb();
  const [call] = await db
    .select()
    .from(calls)
    .where(and(eq(calls.call_id, callId), eq(calls.tenant_id, tenantId)));
  if (!call) throw new NotFoundError(`Call ${callId} not found`);
  return call;
}

export async function updateCall(
  tenantId: string,
  callId: string,
  data: Partial<Omit<Call, 'call_id' | 'tenant_id' | 'created_at'>>,
): Promise<Call> {
  const db = getDb();
  const [updated] = await db
    .update(calls)
    .set(data)
    .where(and(eq(calls.call_id, callId), eq(calls.tenant_id, tenantId)))
    .returning();
  if (!updated) throw new NotFoundError(`Call ${callId} not found`);
  return updated;
}

/** Find a contact by phone number within a tenant */
export async function findContactByPhone(tenantId: string, phone: string): Promise<string | null> {
  const db = getDb();
  const [contact] = await db
    .select({ contact_id: contacts.contact_id })
    .from(contacts)
    .where(and(eq(contacts.tenant_id, tenantId), eq(contacts.phone, phone)));
  return contact?.contact_id ?? null;
}

/** Get recording URL for a call (returns the stored recording_url) */
export async function getCallRecordingUrl(tenantId: string, callId: string): Promise<string | null> {
  const call = await getCall(tenantId, callId);
  return call.recording_url ?? null;
}
