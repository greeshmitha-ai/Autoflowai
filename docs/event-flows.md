# Cross-Service Event Flows

This document describes the key event-driven flows across the AI Company Platform. All events are published to the Kafka message bus and consumed by downstream services. Every event carries `tenant_id` for multi-tenant isolation.

---

## 1. Chatbot Escalation → Live Chat Session → Operator Notification

**Trigger:** Chatbot confidence score drops below the agent's configured `escalation_threshold`.

```
Chatbot Engine
  └─ publishes: conversation.escalated
       payload: { conversation_id, contact_id, agent_id, reason }
       topic: conversations

Live Chat Service  [consumer: live-chat-consumer]
  └─ consumes: conversation.escalated
  └─ creates: live_chat_session (status=waiting)
  └─ notifies available operators via WebSocket push
  └─ assigns to first accepting operator
  └─ delivers full prior transcript + Contact summary + Lead_Score to operator

Notification Service  [consumer: notification-consumer]
  └─ consumes: conversation.escalated  (operator assignment notification)
  └─ delivers: in_app + email to assigned operator
```

**Topics consumed:** `conversations`
**SLA:** Operator notified within 1 second of escalation event.

---

## 2. Survey Low Score → Automation Engine Workflow Trigger

**Trigger:** A survey response is submitted with a score ≤ 6.

```
Feedback Engine
  └─ publishes: survey.response.submitted
       payload: { survey_id, response_id, contact_id, nps_score }
       topic: surveys
  └─ publishes: survey.low_score  (when score ≤ 6)
       payload: { survey_id, response_id, contact_id, score }
       topic: surveys

Automation Engine  [consumer: automation-consumer]
  └─ consumes: survey.low_score
  └─ evaluates active workflows with trigger type: survey_low_score
  └─ spawns WorkflowExecution within 10 seconds
  └─ executes configured action nodes (e.g. send email, create task, assign to campaign)
```

**Topics consumed:** `surveys`
**SLA:** Workflow execution spawned within 10 seconds of event.

---

## 3. Call Completed → Feedback Engine Dispatches Survey

**Trigger:** A call ends (inbound or outbound).

```
Call Engine
  └─ publishes: call.completed
       payload: { call_id, contact_id, direction, duration_seconds, outcome }
       topic: calls

Feedback Engine  [consumer: feedback-consumer]
  └─ consumes: call.completed
  └─ looks up active post-call survey for tenant
  └─ dispatches survey via email or SMS to contact
  └─ publishes: survey.response.submitted (when response arrives)

Attribution Engine  [consumer: attribution-consumer]
  └─ consumes: call.completed
  └─ records touchpoint: { contact_id, channel: 'call', event_type: 'call.completed' }
```

**Topics consumed:** `calls`
**SLA:** Survey dispatched within 60 seconds of call.completed event.

---

## 4. Deal Won → Attribution Engine Calculates Credit

**Trigger:** A deal's status is updated to `won` in the CRM.

```
CRM Service
  └─ publishes: deal.status_updated
       payload: { deal_id, contact_id, pipeline_id, old_status, new_status: 'won' }
       topic: crm

Attribution Engine  [consumer: attribution-consumer]
  └─ consumes: deal.status_updated  (filters: new_status === 'won')
  └─ loads all touchpoints for contact_id
  └─ applies tenant's attribution model (first-touch | last-touch | linear)
  └─ writes attribution_credits records to database
```

**Topics consumed:** `crm`
**Attribution models:** first-touch, last-touch, linear (configurable per tenant).

---

## 5. Campaign Send → Delivery Tracking → Attribution Touchpoint

**Trigger:** A campaign is sent to its audience.

```
Marketing Engine
  └─ publishes: campaign.sent
       payload: { campaign_id, recipient_count }
       topic: campaigns
  └─ publishes: campaign.delivered  (per recipient)
       payload: { campaign_id, contact_id, channel }
       topic: campaigns
  └─ publishes: campaign.opened  (pixel tracking)
       payload: { campaign_id, contact_id }
       topic: campaigns
  └─ publishes: campaign.clicked  (link-wrap redirect)
       payload: { campaign_id, contact_id, link_url }
       topic: campaigns

Attribution Engine  [consumer: attribution-consumer]
  └─ consumes: campaign.opened  → touchpoint: { channel: 'email' }
  └─ consumes: campaign.clicked → touchpoint: { channel: 'campaign' }

Lead Scorer  [consumer: lead-scorer-consumer]
  └─ consumes: campaign.opened, campaign.clicked
  └─ recalculates lead_score for contact immediately
```

**Topics consumed:** `campaigns`

---

## 6. Notification Service — All Event Sources

The Notification Service subscribes to the following topics and delivers in-app, email, and push notifications based on per-user preferences.

| Event | Topic | Notification Target |
|---|---|---|
| `task.due_reminder` | tasks | assigned_to user |
| `task.overdue_escalation` | tasks | assigned_to user (+ manager if configured) |
| `booking.confirmed` | bookings | assigned_to user |
| `collaboration.mention` | collaboration | mentioned users |
| `collaboration.assigned` | collaboration | assigned_to user |
| `billing.usage_threshold` | billing | tenant owner |
| `billing.payment_failed` | billing | tenant owner |
| `security.brute_force` | security | tenant owners/admins (bypasses DND) |
| `security.anomalous_api` | security | tenant owners/admins (bypasses DND) |
| `deal.overdue` | crm | deal owner |
| `conversation.escalated` | conversations | available operators |

**Topics subscribed:** `tasks`, `bookings`, `collaboration`, `billing`, `security`, `crm`, `conversations`

---

## 7. Attribution Engine — All Touchpoint Sources

The Attribution Engine subscribes to the following topics to record marketing touchpoints.

| Event | Topic | Touchpoint Channel |
|---|---|---|
| `campaign.opened` | campaigns | email |
| `campaign.clicked` | campaigns | campaign |
| `conversation.closed` | conversations | chatbot |
| `call.completed` | calls | call |
| `deal.status_updated` (won) | crm | → triggers attribution calculation |

**Topics subscribed:** `campaigns`, `conversations`, `calls`, `crm`

---

## 8. Lead Scorer — Interaction Event Sources

The Lead Scorer recalculates scores immediately on qualifying interaction events.

| Event | Topic | Signal |
|---|---|---|
| `campaign.opened` | campaigns | +email engagement |
| `campaign.clicked` | campaigns | +strong email engagement |
| `conversation.closed` | conversations | +chatbot interaction |
| `call.completed` | calls | +call interaction |
| `survey.response.submitted` | surveys | +feedback signal |

---

## Topic → Consumer Map

| Kafka Topic | Consumers |
|---|---|
| `campaigns` | attribution-consumer, lead-scorer-consumer |
| `conversations` | live-chat-consumer, attribution-consumer, notification-consumer, team-inbox-consumer |
| `calls` | feedback-consumer, attribution-consumer, lead-scorer-consumer |
| `surveys` | automation-consumer |
| `crm` | attribution-consumer, notification-consumer |
| `tasks` | notification-consumer |
| `bookings` | notification-consumer |
| `collaboration` | notification-consumer |
| `billing` | notification-consumer |
| `security` | notification-consumer |
