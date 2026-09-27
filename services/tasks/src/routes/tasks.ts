import type { FastifyInstance } from 'fastify';
import {
  createTask,
  updateTask,
  listTasks,
  createBookingSlot,
  listBookingSlots,
  bookSlot,
  NotFoundError,
  ValidationError,
  ConflictError,
} from '../task.service.js';
import type { TasksConfig } from '../config.js';
import '../types.js';

export function registerTaskRoutes(app: FastifyInstance, config: TasksConfig): void {
  // POST /tasks — create task (authenticated)
  app.post<{
    Body: {
      title: string;
      description?: string;
      due_date?: string;
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      assigned_to?: string;
      contact_id?: string;
      deal_id?: string;
    };
  }>('/tasks', async (request, reply) => {
    const { tenant_id, user_id } = request.auth;
    const body = request.body;

    try {
      const input: import('../task.service.js').CreateTaskInput = {
        title: body.title,
        assigned_to: body.assigned_to ?? user_id,
      };
      if (body.description !== undefined) input.description = body.description;
      if (body.due_date !== undefined) input.due_date = body.due_date;
      if (body.priority !== undefined) input.priority = body.priority;
      if (body.contact_id !== undefined) input.contact_id = body.contact_id;
      if (body.deal_id !== undefined) input.deal_id = body.deal_id;

      const task = await createTask(tenant_id, input);
      await reply.status(201).send(task);
    } catch (err) {
      if (err instanceof ValidationError) {
        await reply.status(400).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to create task');
        await reply.status(500).send({ error: 'Failed to create task' });
      }
    }
  });

  // PUT /tasks/:id — update task (authenticated)
  app.put<{
    Params: { id: string };
    Body: {
      title?: string;
      description?: string;
      due_date?: string | null;
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      assigned_to?: string;
      contact_id?: string | null;
      deal_id?: string | null;
      status?: 'open' | 'completed' | 'overdue';
    };
  }>('/tasks/:id', async (request, reply) => {
    const { tenant_id } = request.auth;
    const { id: taskId } = request.params;

    try {
      const task = await updateTask(tenant_id, taskId, request.body);
      await reply.status(200).send(task);
    } catch (err) {
      if (err instanceof NotFoundError) {
        await reply.status(404).send({ error: err.message });
      } else if (err instanceof ValidationError) {
        await reply.status(400).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to update task');
        await reply.status(500).send({ error: 'Failed to update task' });
      }
    }
  });

  // GET /tasks — personal task list for authenticated user (sortable)
  app.get<{
    Querystring: {
      sort_by?: 'due_date' | 'priority';
      order?: 'asc' | 'desc';
    };
  }>('/tasks', async (request, reply) => {
    const { tenant_id, user_id } = request.auth;
    const { sort_by, order } = request.query;

    try {
      const q: import('../task.service.js').ListTasksQuery = {};
      if (sort_by !== undefined) q.sort_by = sort_by;
      if (order !== undefined) q.order = order;
      const taskList = await listTasks(tenant_id, user_id, q);
      await reply.status(200).send({ tasks: taskList });
    } catch (err) {
      app.log.error(err, 'Failed to list tasks');
      await reply.status(500).send({ error: 'Failed to list tasks' });
    }
  });

  // POST /tasks/from-automation — create task from Automation Engine (23.4)
  app.post<{
    Body: {
      tenant_id: string;
      title: string;
      description?: string;
      due_date?: string;
      priority?: 'low' | 'medium' | 'high' | 'urgent';
      assigned_to: string;
      contact_id?: string;
      deal_id?: string;
    };
  }>(
    '/tasks/from-automation',
    { config: { skipAuth: true } },
    async (request, reply) => {
      const body = request.body;

      if (!body.tenant_id) {
        await reply.status(400).send({ error: 'tenant_id is required' });
        return;
      }

      try {
        const input: import('../task.service.js').CreateTaskInput = {
          title: body.title,
          assigned_to: body.assigned_to,
        };
        if (body.description !== undefined) input.description = body.description;
        if (body.due_date !== undefined) input.due_date = body.due_date;
        if (body.priority !== undefined) input.priority = body.priority;
        if (body.contact_id !== undefined) input.contact_id = body.contact_id;
        if (body.deal_id !== undefined) input.deal_id = body.deal_id;

        const task = await createTask(body.tenant_id, input);
        await reply.status(201).send(task);
      } catch (err) {
        if (err instanceof ValidationError) {
          await reply.status(400).send({ error: err.message });
        } else {
          app.log.error(err, 'Failed to create task from automation');
          await reply.status(500).send({ error: 'Failed to create task' });
        }
      }
    },
  );

  // POST /booking-slots — define available time slots (authenticated)
  app.post<{
    Body: { start_time: string; end_time: string };
  }>('/booking-slots', async (request, reply) => {
    const { tenant_id, user_id } = request.auth;
    const { start_time, end_time } = request.body;

    try {
      const slot = await createBookingSlot(tenant_id, user_id, { start_time, end_time });
      await reply.status(201).send(slot);
    } catch (err) {
      if (err instanceof ValidationError) {
        await reply.status(400).send({ error: err.message });
      } else {
        app.log.error(err, 'Failed to create booking slot');
        await reply.status(500).send({ error: 'Failed to create booking slot' });
      }
    }
  });

  // GET /booking-slots — list available slots for authenticated user
  app.get('/booking-slots', async (request, reply) => {
    const { tenant_id, user_id } = request.auth;

    try {
      const slots = await listBookingSlots(tenant_id, user_id);
      await reply.status(200).send({ slots });
    } catch (err) {
      app.log.error(err, 'Failed to list booking slots');
      await reply.status(500).send({ error: 'Failed to list booking slots' });
    }
  });

  // POST /booking-slots/:slotId/book — public endpoint, no auth required
  app.post<{
    Params: { slotId: string };
    Body: {
      customer_email: string;
      customer_name: string;
      contact_id?: string;
      tenant_id: string;
    };
  }>(
    '/booking-slots/:slotId/book',
    { config: { skipAuth: true } },
    async (request, reply) => {
      const { slotId } = request.params;
      const { tenant_id, customer_email, customer_name, contact_id } = request.body;

      if (!tenant_id) {
        await reply.status(400).send({ error: 'tenant_id is required' });
        return;
      }

      try {
        const bookInput: import('../task.service.js').BookSlotInput = {
          customer_email,
          customer_name,
        };
        if (contact_id !== undefined) bookInput.contact_id = contact_id;

        const result = await bookSlot(
          tenant_id,
          slotId,
          bookInput,
          config.kafkaBrokers,
        );
        await reply.status(201).send({
          booking_id: result.booking.booking_id,
          booking_token: result.booking.booking_token,
          confirmed_at: result.booking.confirmed_at,
          slot: {
            start_time: result.slot.start_time,
            end_time: result.slot.end_time,
          },
        });
      } catch (err) {
        if (err instanceof NotFoundError) {
          await reply.status(404).send({ error: err.message });
        } else if (err instanceof ConflictError) {
          await reply.status(409).send({ error: err.message });
        } else if (err instanceof ValidationError) {
          await reply.status(400).send({ error: err.message });
        } else {
          app.log.error(err, 'Failed to book slot');
          await reply.status(500).send({ error: 'Failed to book slot' });
        }
      }
    },
  );
}
