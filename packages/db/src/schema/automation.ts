import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  pgEnum,
  jsonb,
} from 'drizzle-orm/pg-core';
import { tenants } from './tenants.js';

export const workflowStatusEnum = pgEnum('workflow_status', ['draft', 'active', 'inactive']);
export const workflowExecutionStatusEnum = pgEnum('workflow_execution_status', [
  'running',
  'completed',
  'failed',
]);

// ─── Workflow Node / Edge types ───────────────────────────────────────────────

export type NodeType = 'trigger' | 'condition' | 'action' | 'delay';

export interface WorkflowNode {
  id: string;
  type: NodeType;
  label: string;
  config: Record<string, unknown>;
  position?: { x: number; y: number };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface TriggerConfig {
  type: string; // e.g. 'contact.created', 'lead_score_threshold', 'survey.low_score', etc.
  conditions?: Record<string, unknown>;
}

export interface WorkflowDefinition {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  trigger: TriggerConfig;
}

export interface ErrorLogEntry {
  node_id: string;
  error: string;
  timestamp: string;
  attempt?: number;
}

// ─── Workflows ────────────────────────────────────────────────────────────────

export const workflows = pgTable('workflows', {
  workflow_id: uuid('workflow_id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  name: varchar('name', { length: 255 }).notNull(),
  status: workflowStatusEnum('status').notNull().default('draft'),
  definition: jsonb('definition').$type<WorkflowDefinition>().notNull().default({
    nodes: [],
    edges: [],
    trigger: { type: '' },
  }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ─── Workflow Executions ──────────────────────────────────────────────────────

export const workflowExecutions = pgTable('workflow_executions', {
  execution_id: uuid('execution_id').primaryKey().defaultRandom(),
  workflow_id: uuid('workflow_id')
    .notNull()
    .references(() => workflows.workflow_id),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.tenant_id),
  status: workflowExecutionStatusEnum('status').notNull().default('running'),
  started_at: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  ended_at: timestamp('ended_at', { withTimezone: true }),
  error_log: jsonb('error_log').$type<ErrorLogEntry[]>().notNull().default([]),
});

// ─── Types ────────────────────────────────────────────────────────────────────

export type Workflow = typeof workflows.$inferSelect;
export type NewWorkflow = typeof workflows.$inferInsert;
export type WorkflowExecution = typeof workflowExecutions.$inferSelect;
export type NewWorkflowExecution = typeof workflowExecutions.$inferInsert;
