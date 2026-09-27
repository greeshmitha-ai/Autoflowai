/**
 * Node executor — runs a single workflow node and returns a result.
 * Supports: trigger, condition, action, delay node types.
 * Built-in action nodes: send_email, send_sms, update_contact_field,
 *   create_task, call_webhook, add_to_campaign.
 * AI action node: generate_content (calls Content_Assistant stub).
 */

export interface NodeContext {
  tenant_id: string;
  execution_id: string;
  contact_id: string | undefined;
  event_payload: Record<string, unknown>;
  /** Accumulated outputs from previously executed nodes */
  outputs: Record<string, unknown>;
}

export interface NodeResult {
  success: boolean;
  output?: unknown;
  error?: string;
  /** For condition nodes: which branch to follow */
  branch?: 'true' | 'false';
}

// ─── Condition evaluation ─────────────────────────────────────────────────────

function evaluateCondition(
  config: Record<string, unknown>,
  ctx: NodeContext,
): boolean {
  const { field, operator, value } = config as {
    field: string;
    operator: string;
    value: unknown;
  };

  // Resolve field from event_payload or outputs
  const actual =
    ctx.event_payload[field] ??
    (ctx.outputs[field] as unknown);

  switch (operator) {
    case 'eq':
      return actual === value;
    case 'neq':
      return actual !== value;
    case 'gt':
      return typeof actual === 'number' && typeof value === 'number' && actual > value;
    case 'gte':
      return typeof actual === 'number' && typeof value === 'number' && actual >= value;
    case 'lt':
      return typeof actual === 'number' && typeof value === 'number' && actual < value;
    case 'lte':
      return typeof actual === 'number' && typeof value === 'number' && actual <= value;
    case 'contains':
      return typeof actual === 'string' && typeof value === 'string' && actual.includes(value);
    case 'exists':
      return actual !== undefined && actual !== null;
    default:
      return false;
  }
}

// ─── Content Assistant stub (8.6) ────────────────────────────────────────────

async function callContentAssistant(
  goal: string,
  contactId: string | undefined,
  _tenantId: string,
): Promise<string> {
  // Stub: in production this would call the Content_Assistant service
  return `[AI-generated content for goal="${goal}" contact=${contactId ?? 'unknown'}]`;
}

// ─── Action node handlers ─────────────────────────────────────────────────────

async function executeSendEmail(
  config: Record<string, unknown>,
  ctx: NodeContext,
): Promise<NodeResult> {
  const { to, subject, body } = config as { to?: string; subject?: string; body?: string };
  // Stub: in production, call email provider
  console.log(`[automation] send_email to=${to ?? ctx.contact_id} subject="${subject}" body="${body}"`);
  return { success: true, output: { sent: true, to: to ?? ctx.contact_id } };
}

async function executeSendSms(
  config: Record<string, unknown>,
  ctx: NodeContext,
): Promise<NodeResult> {
  const { to, message } = config as { to?: string; message?: string };
  console.log(`[automation] send_sms to=${to ?? ctx.contact_id} message="${message}"`);
  return { success: true, output: { sent: true, to: to ?? ctx.contact_id } };
}

async function executeUpdateContactField(
  config: Record<string, unknown>,
  ctx: NodeContext,
): Promise<NodeResult> {
  const { field, value } = config as { field: string; value: unknown };
  const contactId = ctx.contact_id;
  if (!contactId) return { success: false, error: 'No contact_id in context' };
  // Stub: in production, call Contact Service
  console.log(`[automation] update_contact_field contact=${contactId} ${field}=${String(value)}`);
  return { success: true, output: { contact_id: contactId, field, value } };
}

async function executeCreateTask(
  config: Record<string, unknown>,
  ctx: NodeContext,
): Promise<NodeResult> {
  const { title, due_date, priority } = config as {
    title: string;
    due_date?: string;
    priority?: string;
  };
  console.log(`[automation] create_task title="${title}" contact=${ctx.contact_id}`);
  return {
    success: true,
    output: {
      task_id: `stub-task-${Date.now()}`,
      title,
      due_date,
      priority: priority ?? 'medium',
      contact_id: ctx.contact_id,
    },
  };
}

async function executeCallWebhook(
  config: Record<string, unknown>,
  ctx: NodeContext,
): Promise<NodeResult> {
  const { url, method = 'POST', headers = {} } = config as {
    url: string;
    method?: string;
    headers?: Record<string, string>;
  };

  try {
    const response = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify({ tenant_id: ctx.tenant_id, contact_id: ctx.contact_id, event: ctx.event_payload }),
    });
    return { success: response.ok, output: { status: response.status, url } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function executeAddToCampaign(
  config: Record<string, unknown>,
  ctx: NodeContext,
): Promise<NodeResult> {
  const { campaign_id } = config as { campaign_id: string };
  console.log(`[automation] add_to_campaign campaign=${campaign_id} contact=${ctx.contact_id}`);
  return { success: true, output: { campaign_id, contact_id: ctx.contact_id } };
}

async function executeGenerateContent(
  config: Record<string, unknown>,
  ctx: NodeContext,
): Promise<NodeResult> {
  const { goal } = config as { goal: string };
  const content = await callContentAssistant(goal, ctx.contact_id, ctx.tenant_id);
  return { success: true, output: { content } };
}

// ─── Main executor ────────────────────────────────────────────────────────────

export async function executeNode(
  node: { id: string; type: string; config: Record<string, unknown> },
  ctx: NodeContext,
): Promise<NodeResult> {
  switch (node.type) {
    case 'trigger':
      // Trigger nodes are evaluated by the engine before execution starts
      return { success: true, output: ctx.event_payload };

    case 'condition': {
      const passed = evaluateCondition(node.config, ctx);
      return { success: true, branch: passed ? 'true' : 'false', output: { passed } };
    }

    case 'delay': {
      const ms = (node.config['delay_ms'] as number | undefined) ?? 0;
      if (ms > 0) await new Promise((r) => setTimeout(r, ms));
      return { success: true, output: { delayed_ms: ms } };
    }

    case 'action': {
      const actionType = node.config['action_type'] as string | undefined;
      switch (actionType) {
        case 'send_email':
          return executeSendEmail(node.config, ctx);
        case 'send_sms':
          return executeSendSms(node.config, ctx);
        case 'update_contact_field':
          return executeUpdateContactField(node.config, ctx);
        case 'create_task':
          return executeCreateTask(node.config, ctx);
        case 'call_webhook':
          return executeCallWebhook(node.config, ctx);
        case 'add_to_campaign':
          return executeAddToCampaign(node.config, ctx);
        case 'generate_content':
          return executeGenerateContent(node.config, ctx);
        default:
          return { success: false, error: `Unknown action_type: ${actionType ?? 'undefined'}` };
      }
    }

    default:
      return { success: false, error: `Unknown node type: ${node.type}` };
  }
}
