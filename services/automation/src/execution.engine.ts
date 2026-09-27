/**
 * Workflow Execution Engine
 *
 * - Evaluates trigger conditions against incoming platform events
 * - Spawns execution instances for matching active workflows
 * - Executes nodes sequentially, logging results to workflow_executions.error_log
 * - Retries failed nodes up to 3 times with exponential backoff (1s, 2s, 4s)
 * - Supports lead_score_threshold trigger type (8.9)
 */

import { eq, and } from 'drizzle-orm';
import {
  getDb,
  workflows,
  workflowExecutions,
  type WorkflowDefinition,
  type ErrorLogEntry,
} from '@platform/db';
import { EventConsumer } from '@platform/events';
import type { PlatformEvent } from '@platform/events';
import { executeNode, type NodeContext } from './nodes/executor.js';
import type { AutomationConfig } from './config.js';

// ─── Retry with exponential backoff ──────────────────────────────────────────

const RETRY_DELAYS_MS = [1000, 2000, 4000];

async function withRetry(
  fn: () => Promise<{ success: boolean; error?: string; output?: unknown; branch?: 'true' | 'false' }>,
  nodeId: string,
  errorLog: ErrorLogEntry[],
): Promise<{ success: boolean; output?: unknown; branch?: 'true' | 'false' }> {
  let lastError = '';

  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const result = await fn();
      if (result.success) return result;

      lastError = result.error ?? 'Node returned failure';
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    // Log this failure attempt
    errorLog.push({
      node_id: nodeId,
      error: lastError,
      timestamp: new Date().toISOString(),
      attempt: attempt + 1,
    });

    if (attempt < RETRY_DELAYS_MS.length) {
      await sleep(RETRY_DELAYS_MS[attempt]!);
    }
  }

  return { success: false };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Trigger matching ─────────────────────────────────────────────────────────

function matchesTrigger(
  trigger: WorkflowDefinition['trigger'],
  event: PlatformEvent,
): boolean {
  // lead_score_threshold trigger (8.9)
  if (trigger.type === 'lead_score_threshold') {
    if (event.type !== 'contact.updated') return false;
    const threshold = (trigger.conditions?.['threshold'] as number | undefined) ?? 0;
    const score = (event.payload as Record<string, unknown>)['lead_score'] as number | undefined;
    return score !== undefined && score >= threshold;
  }

  // Generic event type match
  return trigger.type === event.type;
}

// ─── Execute a single workflow instance ──────────────────────────────────────

async function runWorkflow(
  workflowId: string,
  tenantId: string,
  definition: WorkflowDefinition,
  event: PlatformEvent,
): Promise<void> {
  const db = getDb();

  // Create execution record
  const [execution] = await db
    .insert(workflowExecutions)
    .values({
      workflow_id: workflowId,
      tenant_id: tenantId,
      status: 'running',
      started_at: new Date(),
      error_log: [],
    })
    .returning();

  if (!execution) return;

  const errorLog: ErrorLogEntry[] = [];
  const ctx: NodeContext = {
    tenant_id: tenantId,
    execution_id: execution.execution_id,
    contact_id: (event.payload as Record<string, unknown>)['contact_id'] as string | undefined,
    event_payload: event.payload as Record<string, unknown>,
    outputs: {},
  };

  // Build adjacency map for sequential traversal
  const nodeMap = new Map(definition.nodes.map((n) => [n.id, n]));
  const edgeMap = new Map<string, string[]>(); // source -> targets
  const branchEdgeMap = new Map<string, Map<string, string>>(); // source -> (label -> target)

  for (const edge of definition.edges) {
    if (edge.label) {
      if (!branchEdgeMap.has(edge.source)) branchEdgeMap.set(edge.source, new Map());
      branchEdgeMap.get(edge.source)!.set(edge.label, edge.target);
    } else {
      if (!edgeMap.has(edge.source)) edgeMap.set(edge.source, []);
      edgeMap.get(edge.source)!.push(edge.target);
    }
  }

  // Find trigger node as starting point
  const triggerNode = definition.nodes.find((n) => n.type === 'trigger');
  if (!triggerNode) {
    await db
      .update(workflowExecutions)
      .set({ status: 'failed', ended_at: new Date(), error_log: [{ node_id: 'trigger', error: 'No trigger node found', timestamp: new Date().toISOString() }] })
      .where(eq(workflowExecutions.execution_id, execution.execution_id));
    return;
  }

  // BFS/sequential traversal
  const queue: string[] = [triggerNode.id];
  const visited = new Set<string>();
  let failed = false;

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    const node = nodeMap.get(nodeId);
    if (!node) continue;

    const result = await withRetry(
      () => executeNode(node, ctx),
      nodeId,
      errorLog,
    );

    // Store node output in context
    ctx.outputs[nodeId] = result.output;

    if (!result.success) {
      failed = true;
      break;
    }

    // Determine next nodes
    if (result.branch) {
      // Condition node — follow labelled branch
      const branchTarget = branchEdgeMap.get(nodeId)?.get(result.branch);
      if (branchTarget) queue.push(branchTarget);
    } else {
      const nextNodes = edgeMap.get(nodeId) ?? [];
      queue.push(...nextNodes);
    }
  }

  // Finalize execution record
  await db
    .update(workflowExecutions)
    .set({
      status: failed ? 'failed' : 'completed',
      ended_at: new Date(),
      error_log: errorLog,
    })
    .where(eq(workflowExecutions.execution_id, execution.execution_id));
}

// ─── Engine class ─────────────────────────────────────────────────────────────

export class ExecutionEngine {
  private consumer: EventConsumer;

  constructor(config: AutomationConfig) {
    this.consumer = new EventConsumer({
      brokers: config.kafkaBrokers,
      clientId: 'automation-engine',
      groupId: 'automation-engine-group',
    });
  }

  async start(): Promise<void> {
    await this.consumer.connect();

    // Subscribe to all platform event topics
    await this.consumer.subscribe([
      'contacts',
      'campaigns',
      'conversations',
      'calls',
      'surveys',
      'workflows',
    ]);

    // Handle every event type by checking active workflows
    const handleEvent = async (event: PlatformEvent): Promise<void> => {
      await this.dispatchEvent(event);
    };

    // Register handlers for all relevant event types
    const eventTypes: PlatformEvent['type'][] = [
      'contact.created',
      'contact.updated',
      'contact.deleted',
      'campaign.sent',
      'campaign.opened',
      'campaign.clicked',
      'campaign.unsubscribed',
      'conversation.escalated',
      'conversation.closed',
      'call.completed',
      'survey.response.submitted',
      'survey.low_score',
    ];

    for (const type of eventTypes) {
      this.consumer.on(type, handleEvent as never);
    }

    await this.consumer.run();
    console.log('[automation] Execution engine started, listening for events');
  }

  async stop(): Promise<void> {
    await this.consumer.disconnect();
  }

  /**
   * Find all active workflows whose trigger matches the event and spawn executions.
   * Must complete within 10 seconds per requirement 6.2.
   */
  async dispatchEvent(event: PlatformEvent): Promise<void> {
    const db = getDb();

    // Load all active workflows for this tenant
    const activeWorkflows = await db
      .select()
      .from(workflows)
      .where(
        and(
          eq(workflows.tenant_id, event.tenant_id),
          eq(workflows.status, 'active'),
        ),
      );

    const matching = activeWorkflows.filter((wf) =>
      matchesTrigger(wf.definition.trigger, event),
    );

    // Spawn executions concurrently (fire-and-forget with error capture)
    await Promise.all(
      matching.map((wf) =>
        runWorkflow(wf.workflow_id, wf.tenant_id, wf.definition, event).catch((err) => {
          console.error(`[automation] Execution failed for workflow ${wf.workflow_id}:`, err);
        }),
      ),
    );
  }
}
