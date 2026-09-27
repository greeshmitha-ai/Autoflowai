/**
 * Typed event schema definitions for all cross-service events.
 * Every event includes tenant_id for multi-tenant isolation.
 */

export interface BaseEvent {
  event_id: string;
  tenant_id: string;
  timestamp: string; // ISO 8601
  version: string;
}

// ─── Contact Events ───────────────────────────────────────────────────────────

export interface ContactCreatedEvent extends BaseEvent {
  type: 'contact.created';
  payload: {
    contact_id: string;
    email: string;
    full_name: string;
  };
}

export interface ContactUpdatedEvent extends BaseEvent {
  type: 'contact.updated';
  payload: {
    contact_id: string;
    changed_fields: string[];
  };
}

export interface ContactDeletedEvent extends BaseEvent {
  type: 'contact.deleted';
  payload: {
    contact_id: string;
    pii_erasure_requested_at: string;
  };
}

export interface ContactImportCompletedEvent extends BaseEvent {
  type: 'contact.import.completed';
  payload: {
    job_id: string;
    total_rows: number;
    success_count: number;
    error_count: number;
  };
}

// ─── Campaign Events ──────────────────────────────────────────────────────────

export interface CampaignSentEvent extends BaseEvent {
  type: 'campaign.sent';
  payload: {
    campaign_id: string;
    recipient_count: number;
  };
}

export interface CampaignDeliveredEvent extends BaseEvent {
  type: 'campaign.delivered';
  payload: {
    campaign_id: string;
    contact_id: string;
    channel: 'email' | 'sms' | 'in_app';
  };
}

export interface CampaignOpenedEvent extends BaseEvent {
  type: 'campaign.opened';
  payload: {
    campaign_id: string;
    contact_id: string;
  };
}

export interface CampaignClickedEvent extends BaseEvent {
  type: 'campaign.clicked';
  payload: {
    campaign_id: string;
    contact_id: string;
    link_url: string;
  };
}

export interface CampaignUnsubscribedEvent extends BaseEvent {
  type: 'campaign.unsubscribed';
  payload: {
    campaign_id: string;
    contact_id: string;
    channel: string;
  };
}

// ─── Chatbot Events ───────────────────────────────────────────────────────────

export interface ConversationEscalatedEvent extends BaseEvent {
  type: 'conversation.escalated';
  payload: {
    conversation_id: string;
    contact_id: string;
    agent_id: string;
    reason: string;
  };
}

export interface ConversationClosedEvent extends BaseEvent {
  type: 'conversation.closed';
  payload: {
    conversation_id: string;
    contact_id: string;
    duration_seconds: number;
  };
}

// ─── Call Events ──────────────────────────────────────────────────────────────

export interface CallCompletedEvent extends BaseEvent {
  type: 'call.completed';
  payload: {
    call_id: string;
    contact_id: string;
    direction: 'inbound' | 'outbound';
    duration_seconds: number;
    outcome: string;
  };
}

export interface CallTranscriptReadyEvent extends BaseEvent {
  type: 'call.transcript.ready';
  payload: {
    call_id: string;
    contact_id: string;
    transcript: string;
    sentiment_score: number;
  };
}

// ─── Survey / Feedback Events ─────────────────────────────────────────────────

export interface SurveyResponseSubmittedEvent extends BaseEvent {
  type: 'survey.response.submitted';
  payload: {
    survey_id: string;
    response_id: string;
    contact_id: string | null;
    nps_score: number | null;
  };
}

export interface SurveyLowScoreEvent extends BaseEvent {
  type: 'survey.low_score';
  payload: {
    survey_id: string;
    response_id: string;
    contact_id: string | null;
    score: number;
  };
}

// ─── Workflow Events ──────────────────────────────────────────────────────────

export interface WorkflowTriggeredEvent extends BaseEvent {
  type: 'workflow.triggered';
  payload: {
    workflow_id: string;
    trigger_event_type: string;
    context: Record<string, unknown>;
  };
}

export interface WorkflowExecutionCompletedEvent extends BaseEvent {
  type: 'workflow.execution.completed';
  payload: {
    execution_id: string;
    workflow_id: string;
    status: 'completed' | 'failed';
  };
}

// ─── Billing Events ───────────────────────────────────────────────────────────

export interface UsageMeterEvent extends BaseEvent {
  type: 'billing.usage';
  payload: {
    resource: 'contacts' | 'call_minutes' | 'sms_sent' | 'ai_tokens';
    quantity: number;
  };
}

// ─── Union type of all platform events ───────────────────────────────────────

// ─── Security Events ──────────────────────────────────────────────────────────

// ─── Task Events ──────────────────────────────────────────────────────────────

export interface TaskDueReminderEvent extends BaseEvent {
  type: 'task.due_reminder';
  payload: {
    task_id: string;
    assigned_to: string;
    title: string;
    due_date: string;
  };
}

export interface TaskOverdueEscalationEvent extends BaseEvent {
  type: 'task.overdue_escalation';
  payload: {
    task_id: string;
    assigned_to: string;
    title: string;
    due_date: string;
    hours_overdue: number;
  };
}

export interface BookingConfirmedEvent extends BaseEvent {
  type: 'booking.confirmed';
  payload: {
    booking_id: string;
    slot_id: string;
    customer_email: string;
    customer_name: string;
    booking_token: string;
    assigned_to: string;
    start_time: string;
    end_time: string;
  };
}

// ─── Security Events ──────────────────────────────────────────────────────────

// ─── Collaboration Events ─────────────────────────────────────────────────────

export interface CollaborationMentionEvent extends BaseEvent {
  type: 'collaboration.mention';
  payload: {
    note_id: string;
    resource_type: 'contact' | 'deal' | 'conversation';
    resource_id: string;
    mentioned_usernames: string[];
    mentioned_by: string;
    content_preview: string;
  };
}

export interface CollaborationAssignedEvent extends BaseEvent {
  type: 'collaboration.assigned';
  payload: {
    assignment_id: string;
    resource_type: 'contact' | 'deal' | 'conversation';
    resource_id: string;
    assigned_by: string;
    assigned_to: string;
    assigned_at: string;
  };
}

export interface SecurityBruteForceEvent extends BaseEvent {
  type: 'security.brute_force';
  payload: {
    tenant_id: string;
    email: string;
    failure_count: number;
    window_seconds: number;
  };
}

export interface SecurityAnomalousApiEvent extends BaseEvent {
  type: 'security.anomalous_api';
  payload: {
    ip: string;
    request_count: number;
    window_seconds: number;
  };
}

// ─── Deal Events ──────────────────────────────────────────────────────────────

export interface DealStatusUpdatedEvent extends BaseEvent {
  type: 'deal.status_updated';
  payload: {
    deal_id: string;
    contact_id: string;
    pipeline_id: string;
    old_status: string;
    new_status: string;
  };
}

export interface DealOverdueEvent extends BaseEvent {
  type: 'deal.overdue';
  payload: {
    deal_id: string;
    contact_id: string;
    pipeline_id: string;
    owner_id: string;
    name: string;
    expected_close_date: string;
  };
}

export type PlatformEvent =
  | ContactCreatedEvent
  | ContactUpdatedEvent
  | ContactDeletedEvent
  | ContactImportCompletedEvent
  | CampaignSentEvent
  | CampaignDeliveredEvent
  | CampaignOpenedEvent
  | CampaignClickedEvent
  | CampaignUnsubscribedEvent
  | ConversationEscalatedEvent
  | ConversationClosedEvent
  | CallCompletedEvent
  | CallTranscriptReadyEvent
  | SurveyResponseSubmittedEvent
  | SurveyLowScoreEvent
  | WorkflowTriggeredEvent
  | WorkflowExecutionCompletedEvent
  | UsageMeterEvent
  | SecurityBruteForceEvent
  | SecurityAnomalousApiEvent
  | TaskDueReminderEvent
  | TaskOverdueEscalationEvent
  | BookingConfirmedEvent
  | CollaborationMentionEvent
  | CollaborationAssignedEvent
  | DealStatusUpdatedEvent
  | DealOverdueEvent;

export type EventType = PlatformEvent['type'];
