/**
 * Kafka consumer for notification-triggering events.
 *
 * Consumed events:
 *   task.due_reminder, task.overdue_escalation,
 *   booking.confirmed,
 *   collaboration.mention, collaboration.assigned,
 *   billing.usage_threshold (billing.usage), billing.payment_failed,
 *   security.brute_force, security.anomalous_api
 *
 * Requirements: 22.1
 */
import { EventConsumer } from '@platform/events';
import type {
  TaskDueReminderEvent,
  TaskOverdueEscalationEvent,
  BookingConfirmedEvent,
  CollaborationMentionEvent,
  CollaborationAssignedEvent,
  SecurityBruteForceEvent,
  SecurityAnomalousApiEvent,
  DealOverdueEvent,
  ConversationEscalatedEvent,
} from '@platform/events';
import { getDb, users } from '@platform/db';
import { eq, and } from 'drizzle-orm';
import { deliverNotification, type NotificationChannel } from './notification.service.js';
import type { NotificationConfig } from './config.js';

// ─── Helper: resolve user_id for a given tenant + user_id ────────────────────

async function resolveUserId(tenantId: string, userId: string): Promise<string | null> {
  const db = getDb();
  const [user] = await db
    .select({ user_id: users.user_id })
    .from(users)
    .where(and(eq(users.tenant_id, tenantId), eq(users.user_id, userId)))
    .limit(1);
  return user?.user_id ?? null;
}

// ─── Helper: resolve user_id by username (email prefix) ──────────────────────

async function resolveUserByUsername(tenantId: string, username: string): Promise<string | null> {
  const db = getDb();
  // username is the part before @ in email, or full email
  const [user] = await db
    .select({ user_id: users.user_id })
    .from(users)
    .where(and(eq(users.tenant_id, tenantId), eq(users.status, 'active')))
    .limit(50);

  if (!user) return null;

  // Find user whose email starts with username@
  const allUsers = await db
    .select({ user_id: users.user_id, email: users.email })
    .from(users)
    .where(and(eq(users.tenant_id, tenantId), eq(users.status, 'active')));

  const match = allUsers.find(
    (u) => u.email === username || u.email.startsWith(`${username}@`),
  );
  return match?.user_id ?? null;
}

// ─── Helper: get all owner/admin users for security alerts ───────────────────

async function getTenantOwners(tenantId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ user_id: users.user_id })
    .from(users)
    .where(and(eq(users.tenant_id, tenantId), eq(users.status, 'active')));

  // Filter for owner/admin roles — roles is TEXT[]
  const allUsers = await db
    .select({ user_id: users.user_id, roles: users.roles })
    .from(users)
    .where(and(eq(users.tenant_id, tenantId), eq(users.status, 'active')));

  return allUsers
    .filter((u) => u.roles?.some((r) => r === 'owner' || r === 'admin'))
    .map((u) => u.user_id);
}

// ─── Consumer factory ─────────────────────────────────────────────────────────

export function startNotificationConsumer(config: NotificationConfig): EventConsumer {
  const consumer = new EventConsumer({
    brokers: config.kafkaBrokers,
    groupId: 'notification-consumer',
  });

  consumer.withDeadLetterQueue({ topic: 'notification-dlq' });

  const defaultChannels: NotificationChannel[] = ['in_app', 'email'];

  // ── task.due_reminder ──────────────────────────────────────────────────────
  consumer.on<TaskDueReminderEvent>('task.due_reminder', async (event) => {
    const { tenant_id } = event;
    const { task_id, assigned_to, title, due_date } = event.payload;

    const userId = await resolveUserId(tenant_id, assigned_to);
    if (!userId) return;

    await deliverNotification(tenant_id, {
      user_id: userId,
      event_type: 'task.due_reminder',
      payload: { task_id, title, due_date },
      channels: defaultChannels,
    });
  });

  // ── task.overdue_escalation ────────────────────────────────────────────────
  consumer.on<TaskOverdueEscalationEvent>('task.overdue_escalation', async (event) => {
    const { tenant_id } = event;
    const { task_id, assigned_to, title, due_date, hours_overdue } = event.payload;

    const userId = await resolveUserId(tenant_id, assigned_to);
    if (!userId) return;

    await deliverNotification(tenant_id, {
      user_id: userId,
      event_type: 'task.overdue_escalation',
      payload: { task_id, title, due_date, hours_overdue },
      channels: defaultChannels,
    });
  });

  // ── booking.confirmed ──────────────────────────────────────────────────────
  consumer.on<BookingConfirmedEvent>('booking.confirmed', async (event) => {
    const { tenant_id } = event;
    const { booking_id, assigned_to, customer_name, start_time } = event.payload;

    const userId = await resolveUserId(tenant_id, assigned_to);
    if (!userId) return;

    await deliverNotification(tenant_id, {
      user_id: userId,
      event_type: 'booking.confirmed',
      payload: { booking_id, customer_name, start_time },
      channels: defaultChannels,
    });
  });

  // ── collaboration.mention ──────────────────────────────────────────────────
  consumer.on<CollaborationMentionEvent>('collaboration.mention', async (event) => {
    const { tenant_id } = event;
    const { note_id, resource_type, resource_id, mentioned_usernames, mentioned_by, content_preview } =
      event.payload;

    for (const username of mentioned_usernames) {
      const userId = await resolveUserByUsername(tenant_id, username);
      if (!userId || userId === mentioned_by) continue;

      await deliverNotification(tenant_id, {
        user_id: userId,
        event_type: 'collaboration.mention',
        payload: { note_id, resource_type, resource_id, mentioned_by, content_preview },
        channels: defaultChannels,
      });
    }
  });

  // ── collaboration.assigned ─────────────────────────────────────────────────
  consumer.on<CollaborationAssignedEvent>('collaboration.assigned', async (event) => {
    const { tenant_id } = event;
    const { assignment_id, resource_type, resource_id, assigned_by, assigned_to } = event.payload;

    const userId = await resolveUserId(tenant_id, assigned_to);
    if (!userId) return;

    await deliverNotification(tenant_id, {
      user_id: userId,
      event_type: 'collaboration.assigned',
      payload: { assignment_id, resource_type, resource_id, assigned_by },
      channels: defaultChannels,
    });
  });

  // ── security.brute_force ───────────────────────────────────────────────────
  // Critical: bypasses DND and opt-out (Req 22.5, 22.6)
  consumer.on<SecurityBruteForceEvent>('security.brute_force', async (event) => {
    const { tenant_id } = event;
    const { email, failure_count, window_seconds } = event.payload;

    const ownerIds = await getTenantOwners(tenant_id);
    for (const userId of ownerIds) {
      await deliverNotification(tenant_id, {
        user_id: userId,
        event_type: 'security.brute_force',
        payload: { email, failure_count, window_seconds },
        channels: ['in_app', 'email'],
      });
    }
  });

  // ── security.anomalous_api ─────────────────────────────────────────────────
  // Critical: bypasses DND and opt-out (Req 22.5, 22.6)
  consumer.on<SecurityAnomalousApiEvent>('security.anomalous_api', async (event) => {
    const { tenant_id } = event;
    const { ip, request_count, window_seconds } = event.payload;

    const ownerIds = await getTenantOwners(tenant_id);
    for (const userId of ownerIds) {
      await deliverNotification(tenant_id, {
        user_id: userId,
        event_type: 'security.anomalous_api',
        payload: { ip, request_count, window_seconds },
        channels: ['in_app', 'email'],
      });
    }
  });

  // ── deal.overdue ───────────────────────────────────────────────────────────
  consumer.on<DealOverdueEvent>('deal.overdue', async (event) => {
    const { tenant_id } = event;
    const { deal_id, name, expected_close_date, owner_id } = event.payload;

    const userId = await resolveUserId(tenant_id, owner_id);
    if (!userId) return;

    await deliverNotification(tenant_id, {
      user_id: userId,
      event_type: 'deal.overdue',
      payload: { deal_id, name, expected_close_date },
      channels: defaultChannels,
    });
  });

  // ── conversation.escalated ─────────────────────────────────────────────────
  // Notifies operators that a chatbot conversation needs human attention.
  // Live Chat Service handles the actual assignment; this delivers the in-app alert.
  consumer.on<ConversationEscalatedEvent>('conversation.escalated', async (event) => {
    const { tenant_id } = event;
    const { conversation_id, contact_id, reason } = event.payload;

    const operatorIds = await getTenantOwners(tenant_id);
    for (const userId of operatorIds) {
      await deliverNotification(tenant_id, {
        user_id: userId,
        event_type: 'conversation.escalated',
        payload: { conversation_id, contact_id, reason },
        channels: ['in_app'],
      });
    }
  });

  return consumer;
}

export async function runNotificationConsumer(
  config: NotificationConfig,
): Promise<EventConsumer> {
  const consumer = startNotificationConsumer(config);
  await consumer.connect();
  await consumer.subscribe([
    'tasks',
    'bookings',
    'collaboration',
    'billing',
    'security',
    'crm',
    'conversations',
  ]);
  await consumer.run();
  return consumer;
}
