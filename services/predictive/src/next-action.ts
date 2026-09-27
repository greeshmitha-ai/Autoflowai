/**
 * Next-best-action recommendation engine.
 *
 * Actions: send_email | schedule_call | send_sms | assign_to_campaign | no_action
 *
 * Decision inputs:
 *  - lead_score (0–100)
 *  - churn_risk_score (0–1)
 *  - days_since_last_contact
 *  - lifecycle_stage
 */

export type NextAction =
  | 'send_email'
  | 'schedule_call'
  | 'send_sms'
  | 'assign_to_campaign'
  | 'no_action';

export interface NextActionInputs {
  leadScore: number;
  churnRiskScore: number;
  daysSinceLastContact: number;
  lifecycleStage: string | null;
}

export interface NextActionResult {
  action: NextAction;
  reason: string;
  confidence: number;
}

/**
 * Determine the next best action for a contact.
 */
export function computeNextAction(inputs: NextActionInputs): NextActionResult {
  const { leadScore, churnRiskScore, daysSinceLastContact, lifecycleStage } = inputs;

  // High churn risk — immediate personal outreach
  if (churnRiskScore > 0.7) {
    return {
      action: 'schedule_call',
      reason: 'Contact has high churn risk. A personal call can help re-engage them.',
      confidence: 0.85,
    };
  }

  // Medium churn risk + long silence — send SMS for quick re-engagement
  if (churnRiskScore >= 0.4 && daysSinceLastContact >= 14) {
    return {
      action: 'send_sms',
      reason: 'Contact shows medium churn risk and has not been contacted recently. A quick SMS can re-engage.',
      confidence: 0.75,
    };
  }

  // High lead score — assign to nurture campaign
  if (leadScore >= 70 && lifecycleStage !== 'customer') {
    return {
      action: 'assign_to_campaign',
      reason: 'Contact has a high lead score and is not yet a customer. Assign to a conversion campaign.',
      confidence: 0.80,
    };
  }

  // Moderate lead score + not contacted recently — send email
  if (leadScore >= 40 && daysSinceLastContact >= 7) {
    return {
      action: 'send_email',
      reason: 'Contact has moderate engagement and has not been contacted in over a week. Send a follow-up email.',
      confidence: 0.70,
    };
  }

  // Active customer with low churn risk — no action needed
  if (lifecycleStage === 'customer' && churnRiskScore < 0.4) {
    return {
      action: 'no_action',
      reason: 'Contact is an active customer with low churn risk. No immediate action required.',
      confidence: 0.90,
    };
  }

  // Default: send email
  return {
    action: 'send_email',
    reason: 'General follow-up email recommended based on contact profile.',
    confidence: 0.55,
  };
}
