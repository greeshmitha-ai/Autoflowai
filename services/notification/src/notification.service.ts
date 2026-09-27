/**
 * Notification Service — multi-channel delivery, preferences, DND, and role defaults.
 * Requirements: 22.1–22.6
 */
import { eq, and } from 'drizzle-orm';
import {
  getDb,
  notifications,
  notificationPreferences,
  notificationRoleDefaults,
  type Notification,
  type NewNotification,
  type NotificationPreference,
  type NewNotificationPreference,
  type NotificationRoleDefault,
  type NewNotificationRoleDefault,
} from '@platform/db';
import { broadcastToUser } from './ws-registry.js';

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

// ─── Constants ────────────────────────────────────────────────────────────────

/**
 * Critical security event types that bypass DND and opt-out settings.
 * Requirements: 22.5, 22.6
 */
export const CRITICAL_EVENT_TYPES = new Set([
  'security.brute_force',
  'security.anomalous_api',
]);

export type NotificationChannel = 'in_app' | 'email' | 'push';

// ─── DND helpers ──────────────────────────────────────────────────────────────

/**
 * Returns true if the current UTC hour falls within the DND window.
 * DND is active from dnd_start_hour (inclusive) to dnd_end_hour (exclusive).
 * Handles overnight windows (e.g. 22–6).
 */
export function isInDndWindow(
  currentHour: number,
  dndStartHour: number | null | undefined,
  dndEndHour: number | null | undefined,
): boolean {
  if (dndStartHour == null || dndEndHour == null) return false;

  if (dndStartHour <= dndEndHour) {
    // Same-day window: e.g. 9–17
    return currentHour >= dndStartHour && currentHour < dndEndHour;
  } else {
    // Overnight window: e.g. 22–6
    return currentHour >= dndStartHour || currentHour < dndEndHour;
  }
}

/**
 * Filter channels based on user preferences and DND schedule.
 * Critical security events bypass all filters.
 */
export function filterChannels(
  requestedChannels: NotificationChannel[],
  eventType: string,
  pref: NotificationPreference | null,
  currentHour: number = new Date().getUTCHours(),
): NotificationChannel[] {
  // Critical events bypass all filters
  if (CRITICAL_EVENT_TYPES.has(eventType)) {
    return requestedChannels;
  }

  if (!pref) return requestedChannels;

  const allowedChannels = (pref.channels ?? []) as NotificationChannel[];

  // Filter to only channels the user has opted into
  let filtered = requestedChannels.filter((ch) => allowedChannels.includes(ch));

  // Apply DND: suppress push and email during DND hours
  if (isInDndWindow(currentHour, pref.dnd_start_hour, pref.dnd_end_hour)) {
    filtered = filtered.filter((ch) => ch === 'in_app');
  }

  return filtered;
}

// ─── Notification creation ────────────────────────────────────────────────────

export interface DeliverNotificationInput {
  user_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  channels: NotificationChannel[];
}

export async function deliverNotification(
  tenantId: string,
  input: DeliverNotificationInput,
): Promise<Notification> {
  const db = getDb();

  // Load user preferences for this event type
  const [pref] = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.tenant_id, tenantId),
        eq(notificationPreferences.user_id, input.user_id),
        eq(notificationPreferences.event_type, input.event_type),
      ),
    )
    .limit(1);

  const effectiveChannels = filterChannels(
    input.channels,
    input.event_type,
    pref ?? null,
  );

  const deliveredAt: Record<string, string> = {};
  const now = new Date().toISOString();

  // Deliver via each effective channel
  for (const channel of effectiveChannels) {
    if (channel === 'in_app') {
      broadcastToUser(tenantId, input.user_id, {
        type: 'notification',
        event_type: input.event_type,
        payload: input.payload,
        timestamp: now,
      });
      deliveredAt['in_app'] = now;
    } else if (channel === 'email') {
      await deliverEmail(tenantId, input.user_id, input.event_type, input.payload);
      deliveredAt['email'] = now;
    } else if (channel === 'push') {
      await deliverPush(tenantId, input.user_id, input.event_type, input.payload);
      deliveredAt['push'] = now;
    }
  }

  // Persist notification record
  const newNotif: NewNotification = {
    tenant_id: tenantId,
    user_id: input.user_id,
    event_type: input.event_type,
    payload: input.payload,
    channels: effectiveChannels,
    delivered_at: deliveredAt,
  };

  const [notif] = await db.insert(notifications).values(newNotif).returning();
  if (!notif) throw new Error('Failed to persist notification');

  return notif;
}

// ─── Email stub (SendGrid-compatible) ─────────────────────────────────────────

async function deliverEmail(
  tenantId: string,
  userId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // SendGrid-compatible stub — replace with real implementation
  console.log(`[NotificationService] EMAIL stub: tenant=${tenantId} user=${userId} event=${eventType}`, payload);
}

// ─── Push stub (FCM-compatible) ───────────────────────────────────────────────

async function deliverPush(
  tenantId: string,
  userId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  // FCM-compatible stub — replace with real implementation
  console.log(`[NotificationService] PUSH stub: tenant=${tenantId} user=${userId} event=${eventType}`, payload);
}

// ─── Preferences ──────────────────────────────────────────────────────────────

export interface UpsertPreferenceInput {
  event_type: string;
  channels: NotificationChannel[];
  dnd_start_hour?: number | null;
  dnd_end_hour?: number | null;
}

export async function getUserPreferences(
  tenantId: string,
  userId: string,
): Promise<NotificationPreference[]> {
  const db = getDb();
  return db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.tenant_id, tenantId),
        eq(notificationPreferences.user_id, userId),
      ),
    );
}

export async function upsertUserPreference(
  tenantId: string,
  userId: string,
  input: UpsertPreferenceInput,
): Promise<NotificationPreference> {
  if (!input.event_type) throw new ValidationError('event_type is required');
  if (!Array.isArray(input.channels) || input.channels.length === 0) {
    throw new ValidationError('channels must be a non-empty array');
  }

  const db = getDb();

  // Check if preference already exists
  const [existing] = await db
    .select()
    .from(notificationPreferences)
    .where(
      and(
        eq(notificationPreferences.tenant_id, tenantId),
        eq(notificationPreferences.user_id, userId),
        eq(notificationPreferences.event_type, input.event_type),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(notificationPreferences)
      .set({
        channels: input.channels,
        dnd_start_hour: input.dnd_start_hour ?? null,
        dnd_end_hour: input.dnd_end_hour ?? null,
        updated_at: new Date(),
      })
      .where(eq(notificationPreferences.pref_id, existing.pref_id))
      .returning();
    if (!updated) throw new Error('Failed to update preference');
    return updated;
  }

  const newPref: NewNotificationPreference = {
    tenant_id: tenantId,
    user_id: userId,
    event_type: input.event_type,
    channels: input.channels,
    dnd_start_hour: input.dnd_start_hour ?? null,
    dnd_end_hour: input.dnd_end_hour ?? null,
  };

  const [created] = await db.insert(notificationPreferences).values(newPref).returning();
  if (!created) throw new Error('Failed to create preference');
  return created;
}

// ─── Role-level defaults ──────────────────────────────────────────────────────

export interface UpsertRoleDefaultInput {
  role: string;
  event_type: string;
  channels: NotificationChannel[];
  dnd_start_hour?: number | null;
  dnd_end_hour?: number | null;
}

export async function getRoleDefaults(
  tenantId: string,
  role?: string,
): Promise<NotificationRoleDefault[]> {
  const db = getDb();

  const conditions = [eq(notificationRoleDefaults.tenant_id, tenantId)];
  if (role) {
    conditions.push(eq(notificationRoleDefaults.role, role));
  }

  return db
    .select()
    .from(notificationRoleDefaults)
    .where(and(...conditions));
}

export async function upsertRoleDefault(
  tenantId: string,
  input: UpsertRoleDefaultInput,
): Promise<NotificationRoleDefault> {
  if (!input.role) throw new ValidationError('role is required');
  if (!input.event_type) throw new ValidationError('event_type is required');
  if (!Array.isArray(input.channels) || input.channels.length === 0) {
    throw new ValidationError('channels must be a non-empty array');
  }

  const db = getDb();

  const [existing] = await db
    .select()
    .from(notificationRoleDefaults)
    .where(
      and(
        eq(notificationRoleDefaults.tenant_id, tenantId),
        eq(notificationRoleDefaults.role, input.role),
        eq(notificationRoleDefaults.event_type, input.event_type),
      ),
    )
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(notificationRoleDefaults)
      .set({
        channels: input.channels,
        dnd_start_hour: input.dnd_start_hour ?? null,
        dnd_end_hour: input.dnd_end_hour ?? null,
        updated_at: new Date(),
      })
      .where(eq(notificationRoleDefaults.default_id, existing.default_id))
      .returning();
    if (!updated) throw new Error('Failed to update role default');
    return updated;
  }

  const newDefault: NewNotificationRoleDefault = {
    tenant_id: tenantId,
    role: input.role,
    event_type: input.event_type,
    channels: input.channels,
    dnd_start_hour: input.dnd_start_hour ?? null,
    dnd_end_hour: input.dnd_end_hour ?? null,
  };

  const [created] = await db.insert(notificationRoleDefaults).values(newDefault).returning();
  if (!created) throw new Error('Failed to create role default');
  return created;
}
