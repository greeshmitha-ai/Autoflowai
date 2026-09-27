/**
 * Task Service — core business logic for tasks, booking slots, and bookings.
 * Requirements: 18.1–18.7
 */
import { eq, and, sql, asc, desc, lte, gte } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import {
  getDb,
  tasks,
  bookingSlots,
  bookings,
  type Task,
  type NewTask,
  type BookingSlot,
  type NewBookingSlot,
  type Booking,
  type NewBooking,
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

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

// ─── Task CRUD ────────────────────────────────────────────────────────────────

export interface CreateTaskInput {
  title: string;
  description?: string | undefined;
  due_date?: string | undefined;
  priority?: 'low' | 'medium' | 'high' | 'urgent' | undefined;
  assigned_to: string;
  contact_id?: string | undefined;
  deal_id?: string | undefined;
}

export interface UpdateTaskInput {
  title?: string | undefined;
  description?: string | undefined;
  due_date?: string | null | undefined;
  priority?: 'low' | 'medium' | 'high' | 'urgent' | undefined;
  assigned_to?: string | undefined;
  contact_id?: string | null | undefined;
  deal_id?: string | null | undefined;
  status?: 'open' | 'completed' | 'overdue' | undefined;
}

export interface ListTasksQuery {
  sort_by?: 'due_date' | 'priority' | undefined;
  order?: 'asc' | 'desc' | undefined;
}

const PRIORITY_ORDER: Record<string, number> = {
  urgent: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export async function createTask(
  tenantId: string,
  input: CreateTaskInput,
): Promise<Task> {
  if (!input.title?.trim()) throw new ValidationError('title is required');
  if (!input.assigned_to) throw new ValidationError('assigned_to is required');

  const db = getDb();
  const newTask: NewTask = {
    tenant_id: tenantId,
    title: input.title.trim(),
    description: input.description ?? null,
    due_date: input.due_date ? new Date(input.due_date) : null,
    priority: input.priority ?? 'medium',
    assigned_to: input.assigned_to,
    contact_id: input.contact_id ?? null,
    deal_id: input.deal_id ?? null,
    status: 'open',
  };

  const [task] = await db.insert(tasks).values(newTask).returning();
  if (!task) throw new Error('Failed to create task');
  return task;
}

export async function getTask(tenantId: string, taskId: string): Promise<Task> {
  const db = getDb();
  const [task] = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.tenant_id, tenantId), eq(tasks.task_id, taskId)))
    .limit(1);
  if (!task) throw new NotFoundError('Task not found');
  return task;
}

export async function updateTask(
  tenantId: string,
  taskId: string,
  input: UpdateTaskInput,
): Promise<Task> {
  const db = getDb();
  await getTask(tenantId, taskId);

  const updateValues: Partial<typeof tasks.$inferInsert> = {};
  if (input.title !== undefined) updateValues.title = input.title.trim();
  if (input.description !== undefined) updateValues.description = input.description;
  if (input.due_date !== undefined)
    updateValues.due_date = input.due_date ? new Date(input.due_date) : null;
  if (input.priority !== undefined) updateValues.priority = input.priority;
  if (input.assigned_to !== undefined) updateValues.assigned_to = input.assigned_to;
  if (input.contact_id !== undefined) updateValues.contact_id = input.contact_id;
  if (input.deal_id !== undefined) updateValues.deal_id = input.deal_id;
  if (input.status !== undefined) updateValues.status = input.status;

  const [updated] = await db
    .update(tasks)
    .set(updateValues)
    .where(and(eq(tasks.tenant_id, tenantId), eq(tasks.task_id, taskId)))
    .returning();

  if (!updated) throw new Error('Failed to update task');
  return updated;
}

export async function listTasks(
  tenantId: string,
  userId: string,
  query: ListTasksQuery,
): Promise<Task[]> {
  const db = getDb();

  const rows = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.tenant_id, tenantId), eq(tasks.assigned_to, userId)));

  // Sort in-memory to support priority ordering (enum sort)
  const sortBy = query.sort_by ?? 'due_date';
  const order = query.order ?? 'asc';

  return rows.sort((a, b) => {
    if (sortBy === 'priority') {
      const pa = PRIORITY_ORDER[a.priority] ?? 0;
      const pb = PRIORITY_ORDER[b.priority] ?? 0;
      return order === 'asc' ? pa - pb : pb - pa;
    }
    // sort by due_date — nulls last
    const da = a.due_date ? a.due_date.getTime() : Infinity;
    const db2 = b.due_date ? b.due_date.getTime() : Infinity;
    return order === 'asc' ? da - db2 : db2 - da;
  });
}

// ─── Booking Slots ────────────────────────────────────────────────────────────

export interface CreateSlotInput {
  start_time: string;
  end_time: string;
}

export async function createBookingSlot(
  tenantId: string,
  userId: string,
  input: CreateSlotInput,
): Promise<BookingSlot> {
  if (!input.start_time || !input.end_time)
    throw new ValidationError('start_time and end_time are required');

  const start = new Date(input.start_time);
  const end = new Date(input.end_time);
  if (end <= start) throw new ValidationError('end_time must be after start_time');

  const db = getDb();
  const newSlot: NewBookingSlot = {
    tenant_id: tenantId,
    user_id: userId,
    start_time: start,
    end_time: end,
    is_available: true,
  };

  const [slot] = await db.insert(bookingSlots).values(newSlot).returning();
  if (!slot) throw new Error('Failed to create booking slot');
  return slot;
}

export async function listBookingSlots(
  tenantId: string,
  userId: string,
): Promise<BookingSlot[]> {
  const db = getDb();
  return db
    .select()
    .from(bookingSlots)
    .where(
      and(
        eq(bookingSlots.tenant_id, tenantId),
        eq(bookingSlots.user_id, userId),
        eq(bookingSlots.is_available, true),
      ),
    )
    .orderBy(asc(bookingSlots.start_time));
}

// ─── Bookings ─────────────────────────────────────────────────────────────────

export interface BookSlotInput {
  customer_email: string;
  customer_name: string;
  contact_id?: string | undefined;
}

export interface BookingResult {
  booking: Booking;
  slot: BookingSlot;
}

export async function bookSlot(
  tenantId: string,
  slotId: string,
  input: BookSlotInput,
  kafkaBrokers: string[],
): Promise<BookingResult> {
  if (!input.customer_email?.trim()) throw new ValidationError('customer_email is required');
  if (!input.customer_name?.trim()) throw new ValidationError('customer_name is required');

  const db = getDb();

  // Load and validate slot
  const [slot] = await db
    .select()
    .from(bookingSlots)
    .where(
      and(
        eq(bookingSlots.tenant_id, tenantId),
        eq(bookingSlots.slot_id, slotId),
      ),
    )
    .limit(1);

  if (!slot) throw new NotFoundError('Booking slot not found');
  if (!slot.is_available) throw new ConflictError('Booking slot is no longer available');

  const bookingToken = randomUUID();

  // Mark slot as unavailable and create booking atomically
  await db
    .update(bookingSlots)
    .set({ is_available: false })
    .where(eq(bookingSlots.slot_id, slotId));

  const newBooking: NewBooking = {
    tenant_id: tenantId,
    slot_id: slotId,
    contact_id: input.contact_id ?? null,
    customer_email: input.customer_email.trim(),
    customer_name: input.customer_name.trim(),
    booking_token: bookingToken,
    confirmed_at: new Date(),
  };

  const [booking] = await db.insert(bookings).values(newBooking).returning();
  if (!booking) throw new Error('Failed to create booking');

  // Create a Task for the assigned user
  const taskInput: CreateTaskInput = {
    title: `Meeting with ${input.customer_name.trim()}`,
    description: `Booked meeting. Customer email: ${input.customer_email.trim()}`,
    due_date: slot.start_time.toISOString(),
    priority: 'medium',
    assigned_to: slot.user_id,
  };
  if (input.contact_id) taskInput.contact_id = input.contact_id;
  await createTask(tenantId, taskInput);

  // Publish booking confirmation event
  try {
    const publisher = createPublisher(tenantId, { brokers: kafkaBrokers });
    await publisher.connect();
    await publisher.publish('tasks', 'booking.confirmed', {
      booking_id: booking.booking_id,
      slot_id: slotId,
      customer_email: booking.customer_email,
      customer_name: booking.customer_name,
      booking_token: bookingToken,
      assigned_to: slot.user_id,
      start_time: slot.start_time.toISOString(),
      end_time: slot.end_time.toISOString(),
    });
    await publisher.disconnect();
  } catch (err) {
    console.error('[TaskService] Failed to publish booking.confirmed event:', err);
  }

  return { booking, slot };
}

// ─── Due-date reminder and escalation ────────────────────────────────────────

/**
 * Check for tasks at/past due date and publish reminder events.
 * If overdue by 48+ hours, publish escalation event.
 */
export async function checkDueDateReminders(kafkaBrokers: string[]): Promise<void> {
  const db = getDb();
  const now = new Date();
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // Find open tasks that are due (due_date <= now)
  const dueTasks = await db
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.status, 'open'),
        lte(tasks.due_date, now),
      ),
    );

  if (dueTasks.length === 0) return;

  // Group by tenant for publisher reuse
  const byTenant = new Map<string, typeof dueTasks>();
  for (const task of dueTasks) {
    const group = byTenant.get(task.tenant_id) ?? [];
    group.push(task);
    byTenant.set(task.tenant_id, group);
  }

  for (const [tenantId, tenantTasks] of byTenant) {
    let publisher;
    try {
      publisher = createPublisher(tenantId, { brokers: kafkaBrokers });
      await publisher.connect();

      for (const task of tenantTasks) {
        const dueDate = task.due_date!;
        const isEscalation = dueDate <= fortyEightHoursAgo;

        if (isEscalation) {
          const hoursOverdue = Math.floor((now.getTime() - dueDate.getTime()) / (60 * 60 * 1000));

          // Mark task as overdue
          await db
            .update(tasks)
            .set({ status: 'overdue' })
            .where(eq(tasks.task_id, task.task_id));

          await publisher.publish('tasks', 'task.overdue_escalation', {
            task_id: task.task_id,
            assigned_to: task.assigned_to,
            title: task.title,
            due_date: dueDate.toISOString(),
            hours_overdue: hoursOverdue,
          });
        } else {
          await publisher.publish('tasks', 'task.due_reminder', {
            task_id: task.task_id,
            assigned_to: task.assigned_to,
            title: task.title,
            due_date: dueDate.toISOString(),
          });
        }
      }

      await publisher.disconnect();
    } catch (err) {
      console.error(`[TaskService] Failed to publish reminders for tenant ${tenantId}:`, err);
      try {
        await publisher?.disconnect();
      } catch {
        // ignore
      }
    }
  }
}
