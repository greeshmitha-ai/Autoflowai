import { eq, and, desc } from 'drizzle-orm';
import {
  getDb,
  workflows,
  workflowExecutions,
  type Workflow,
  type NewWorkflow,
  type WorkflowExecution,
  type WorkflowDefinition,
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

export class ConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class WorkflowService {
  // ─── Create ───────────────────────────────────────────────────────────────

  async createWorkflow(
    tenantId: string,
    body: { name: string; definition?: WorkflowDefinition },
  ): Promise<Workflow> {
    if (!body.name?.trim()) throw new ValidationError('name is required');

    const db = getDb();
    const [workflow] = await db
      .insert(workflows)
      .values({
        tenant_id: tenantId,
        name: body.name.trim(),
        status: 'draft',
        definition: body.definition ?? { nodes: [], edges: [], trigger: { type: '' } },
      } satisfies NewWorkflow)
      .returning();

    if (!workflow) throw new Error('Failed to create workflow');
    return workflow;
  }

  // ─── Update ───────────────────────────────────────────────────────────────

  async updateWorkflow(
    tenantId: string,
    workflowId: string,
    body: { name?: string; definition?: WorkflowDefinition },
  ): Promise<Workflow> {
    const db = getDb();
    const existing = await this.getWorkflow(tenantId, workflowId);
    if (!existing) throw new NotFoundError('Workflow not found');

    // Block updates on active workflows (409)
    if (existing.status === 'active') {
      throw new ConflictError('Cannot update an active workflow. Deactivate it first.');
    }

    const updates: Partial<NewWorkflow> = { updated_at: new Date() };
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.definition !== undefined) updates.definition = body.definition;

    const [updated] = await db
      .update(workflows)
      .set(updates)
      .where(and(eq(workflows.tenant_id, tenantId), eq(workflows.workflow_id, workflowId)))
      .returning();

    if (!updated) throw new Error('Failed to update workflow');
    return updated;
  }

  // ─── Get ──────────────────────────────────────────────────────────────────

  async getWorkflow(tenantId: string, workflowId: string): Promise<Workflow | null> {
    const db = getDb();
    const [workflow] = await db
      .select()
      .from(workflows)
      .where(and(eq(workflows.tenant_id, tenantId), eq(workflows.workflow_id, workflowId)))
      .limit(1);
    return workflow ?? null;
  }

  // ─── List ─────────────────────────────────────────────────────────────────

  async listWorkflows(tenantId: string): Promise<Workflow[]> {
    const db = getDb();
    return db
      .select()
      .from(workflows)
      .where(eq(workflows.tenant_id, tenantId))
      .orderBy(desc(workflows.created_at));
  }

  // ─── Activate ─────────────────────────────────────────────────────────────

  async activateWorkflow(tenantId: string, workflowId: string): Promise<Workflow> {
    const db = getDb();
    const existing = await this.getWorkflow(tenantId, workflowId);
    if (!existing) throw new NotFoundError('Workflow not found');

    const [updated] = await db
      .update(workflows)
      .set({ status: 'active', updated_at: new Date() })
      .where(and(eq(workflows.tenant_id, tenantId), eq(workflows.workflow_id, workflowId)))
      .returning();

    if (!updated) throw new Error('Failed to activate workflow');
    return updated;
  }

  // ─── Deactivate ───────────────────────────────────────────────────────────

  async deactivateWorkflow(tenantId: string, workflowId: string): Promise<Workflow> {
    const db = getDb();
    const existing = await this.getWorkflow(tenantId, workflowId);
    if (!existing) throw new NotFoundError('Workflow not found');

    const [updated] = await db
      .update(workflows)
      .set({ status: 'inactive', updated_at: new Date() })
      .where(and(eq(workflows.tenant_id, tenantId), eq(workflows.workflow_id, workflowId)))
      .returning();

    if (!updated) throw new Error('Failed to deactivate workflow');
    return updated;
  }

  // ─── Execution history ────────────────────────────────────────────────────

  async getExecutions(
    tenantId: string,
    workflowId: string,
    limit = 1000,
  ): Promise<WorkflowExecution[]> {
    const db = getDb();
    return db
      .select()
      .from(workflowExecutions)
      .where(
        and(
          eq(workflowExecutions.tenant_id, tenantId),
          eq(workflowExecutions.workflow_id, workflowId),
        ),
      )
      .orderBy(desc(workflowExecutions.started_at))
      .limit(limit);
  }
}
