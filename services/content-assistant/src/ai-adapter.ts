/**
 * AI Adapter — pluggable interface for content generation.
 * Default: StubAiAdapter with realistic template content and merge fields.
 * Optional: OpenAiAdapter when OPENAI_API_KEY is set.
 */

export interface EmailDraft {
  subject: string;
  body: string;
}

export interface SmsDraft {
  message: string;
}

export interface ChatbotScriptDraft {
  greeting: string;
  qualification_questions: string[];
  closing: string;
}

export interface ContentAiAdapter {
  generateEmail(
    goal: string,
    audience: string,
    tone: string,
    regenerationIndex: number,
  ): Promise<EmailDraft>;

  generateSms(
    objective: string,
    segmentContext: string,
    regenerationIndex: number,
  ): Promise<SmsDraft>;

  generateChatbotScript(
    useCase: string,
    regenerationIndex: number,
  ): Promise<ChatbotScriptDraft>;

  /** Whether the AI service is available */
  isAvailable(): boolean;
}

// ─── Merge field helpers ──────────────────────────────────────────────────────

/** Common merge field placeholders used in generated content */
const MERGE_FIELDS = {
  firstName: '{{first_name}}',
  lastName: '{{last_name}}',
  companyName: '{{company_name}}',
  jobTitle: '{{job_title}}',
  productName: '{{product_name}}',
  senderName: '{{sender_name}}',
  unsubscribeLink: '{{unsubscribe_link}}',
  ctaLink: '{{cta_link}}',
};

// ─── Stub adapter (default) ───────────────────────────────────────────────────

const EMAIL_VARIANTS = [
  {
    subjectTemplate: (goal: string) => `Achieve ${goal} — A Message for {{first_name}}`,
    bodyTemplate: (goal: string, audience: string, tone: string) =>
      `Hi ${MERGE_FIELDS.firstName},\n\nWe know that ${audience} like you care about ${goal}.\n\n` +
      `At ${MERGE_FIELDS.companyName}, we've built something specifically for ${tone === 'professional' ? 'professionals in your field' : 'people like you'}.\n\n` +
      `${MERGE_FIELDS.productName} helps you ${goal} faster and more effectively.\n\n` +
      `Ready to get started? [Click here](${MERGE_FIELDS.ctaLink})\n\n` +
      `Best regards,\n${MERGE_FIELDS.senderName}\n\n` +
      `[Unsubscribe](${MERGE_FIELDS.unsubscribeLink})`,
  },
  {
    subjectTemplate: (goal: string) => `${MERGE_FIELDS.firstName}, here's how to ${goal}`,
    bodyTemplate: (goal: string, audience: string, _tone: string) =>
      `Hello ${MERGE_FIELDS.firstName},\n\nAs someone in ${audience}, you understand the importance of ${goal}.\n\n` +
      `We'd love to show you how ${MERGE_FIELDS.productName} can make a real difference.\n\n` +
      `Our customers at ${MERGE_FIELDS.companyName} have seen incredible results.\n\n` +
      `Take the next step: [Learn More](${MERGE_FIELDS.ctaLink})\n\n` +
      `Warm regards,\n${MERGE_FIELDS.senderName}\n\n` +
      `[Unsubscribe](${MERGE_FIELDS.unsubscribeLink})`,
  },
  {
    subjectTemplate: (goal: string) => `Exclusive offer for ${MERGE_FIELDS.companyName}: ${goal}`,
    bodyTemplate: (goal: string, audience: string, tone: string) =>
      `Dear ${MERGE_FIELDS.firstName} ${MERGE_FIELDS.lastName},\n\n` +
      `We're reaching out to ${audience} with an ${tone === 'urgent' ? 'urgent' : 'exclusive'} opportunity to ${goal}.\n\n` +
      `${MERGE_FIELDS.productName} is trusted by thousands of ${audience} worldwide.\n\n` +
      `Don't miss out — [Get Started Today](${MERGE_FIELDS.ctaLink})\n\n` +
      `Sincerely,\n${MERGE_FIELDS.senderName}\n\n` +
      `[Unsubscribe](${MERGE_FIELDS.unsubscribeLink})`,
  },
  {
    subjectTemplate: (goal: string) => `Quick question about your ${goal} goals, ${MERGE_FIELDS.firstName}`,
    bodyTemplate: (goal: string, audience: string, _tone: string) =>
      `Hi ${MERGE_FIELDS.firstName},\n\nI wanted to reach out personally to ${audience} who are focused on ${goal}.\n\n` +
      `We've helped companies like ${MERGE_FIELDS.companyName} achieve remarkable results with ${MERGE_FIELDS.productName}.\n\n` +
      `Would you be open to a quick chat? [Schedule a Call](${MERGE_FIELDS.ctaLink})\n\n` +
      `Thanks,\n${MERGE_FIELDS.senderName}\n\n` +
      `[Unsubscribe](${MERGE_FIELDS.unsubscribeLink})`,
  },
  {
    subjectTemplate: (goal: string) => `${MERGE_FIELDS.firstName}, your path to ${goal} starts here`,
    bodyTemplate: (goal: string, audience: string, tone: string) =>
      `Hey ${MERGE_FIELDS.firstName}!\n\n` +
      `${tone === 'casual' || tone === 'friendly' ? "We've been thinking about you and" : 'We wanted to share that'} ` +
      `${audience} are achieving ${goal} with ${MERGE_FIELDS.productName}.\n\n` +
      `Join ${MERGE_FIELDS.companyName}'s growing community and see the difference.\n\n` +
      `[Start Your Journey](${MERGE_FIELDS.ctaLink})\n\n` +
      `Cheers,\n${MERGE_FIELDS.senderName}\n\n` +
      `[Unsubscribe](${MERGE_FIELDS.unsubscribeLink})`,
  },
];

const SMS_VARIANTS = [
  (objective: string, ctx: string) =>
    `Hi ${MERGE_FIELDS.firstName}! ${ctx ? `As a ${ctx}, ` : ''}${objective}. Reply STOP to opt out.`,
  (objective: string, ctx: string) =>
    `${MERGE_FIELDS.firstName}, ${objective}${ctx ? ` — tailored for ${ctx}` : ''}. [${MERGE_FIELDS.ctaLink}]`,
  (objective: string, _ctx: string) =>
    `Exclusive for ${MERGE_FIELDS.firstName}: ${objective}. Act now! [${MERGE_FIELDS.ctaLink}]`,
  (objective: string, ctx: string) =>
    `Hey ${MERGE_FIELDS.firstName}! ${ctx ? `${ctx} special: ` : ''}${objective}. Reply STOP to unsubscribe.`,
  (objective: string, ctx: string) =>
    `${MERGE_FIELDS.firstName} from ${MERGE_FIELDS.companyName}: ${objective}${ctx ? ` for ${ctx}` : ''}. [${MERGE_FIELDS.ctaLink}]`,
];

const CHATBOT_VARIANTS = [
  {
    greeting: (useCase: string) =>
      `Hi ${MERGE_FIELDS.firstName}! Welcome to ${MERGE_FIELDS.companyName}. I'm here to help you with ${useCase}. How can I assist you today?`,
    questions: (useCase: string) => [
      `What specific aspect of ${useCase} are you looking for help with?`,
      `Have you worked with ${MERGE_FIELDS.productName} before?`,
      `What's your timeline for addressing your ${useCase} needs?`,
    ],
    closing: (useCase: string) =>
      `Thank you, ${MERGE_FIELDS.firstName}! I've noted your ${useCase} requirements. A specialist from ${MERGE_FIELDS.companyName} will follow up shortly. Is there anything else I can help you with?`,
  },
  {
    greeting: (useCase: string) =>
      `Hello ${MERGE_FIELDS.firstName}! I'm your ${MERGE_FIELDS.companyName} assistant. I specialize in ${useCase}. What brings you here today?`,
    questions: (useCase: string) => [
      `Can you tell me more about your current ${useCase} challenges?`,
      `What outcome are you hoping to achieve?`,
      `Are you the decision-maker for ${useCase} at ${MERGE_FIELDS.companyName}?`,
    ],
    closing: (_useCase: string) =>
      `Great talking with you, ${MERGE_FIELDS.firstName}! I'll make sure the right team at ${MERGE_FIELDS.companyName} reaches out. Have a wonderful day!`,
  },
  {
    greeting: (useCase: string) =>
      `Hey ${MERGE_FIELDS.firstName}! 👋 Thanks for reaching out about ${useCase}. I'm here to make this easy for you!`,
    questions: (useCase: string) => [
      `Quick question — what's your biggest pain point with ${useCase} right now?`,
      `How many people at ${MERGE_FIELDS.companyName} would benefit from this solution?`,
      `What's your budget range for solving your ${useCase} needs?`,
    ],
    closing: (useCase: string) =>
      `Awesome, ${MERGE_FIELDS.firstName}! You're all set. We'll send a ${useCase} proposal to your email. Feel free to reach out anytime!`,
  },
  {
    greeting: (useCase: string) =>
      `Welcome, ${MERGE_FIELDS.firstName}! I'm the ${MERGE_FIELDS.companyName} virtual assistant for ${useCase}. Let me help you find the right solution.`,
    questions: (useCase: string) => [
      `To better assist you with ${useCase}, could you describe your current situation?`,
      `What solutions have you tried before for ${useCase}?`,
      `When are you looking to implement a ${useCase} solution?`,
    ],
    closing: (_useCase: string) =>
      `Thank you for your time, ${MERGE_FIELDS.firstName}. Your information has been recorded and a ${MERGE_FIELDS.companyName} representative will be in touch within 24 hours.`,
  },
  {
    greeting: (useCase: string) =>
      `Hi there, ${MERGE_FIELDS.firstName}! I'm here to guide you through ${useCase} options at ${MERGE_FIELDS.companyName}. Ready to get started?`,
    questions: (useCase: string) => [
      `What's driving your interest in ${useCase} today?`,
      `How does ${useCase} fit into your overall business goals?`,
      `Who else at ${MERGE_FIELDS.companyName} is involved in this ${useCase} decision?`,
    ],
    closing: (useCase: string) =>
      `Perfect, ${MERGE_FIELDS.firstName}! I've captured everything about your ${useCase} needs. Expect a personalized follow-up from ${MERGE_FIELDS.companyName} soon. Thanks for chatting!`,
  },
];

export class StubContentAiAdapter implements ContentAiAdapter {
  isAvailable(): boolean {
    return true;
  }

  async generateEmail(
    goal: string,
    audience: string,
    tone: string,
    regenerationIndex: number,
  ): Promise<EmailDraft> {
    const idx = regenerationIndex % EMAIL_VARIANTS.length;
    const variant = EMAIL_VARIANTS[idx]!;
    return {
      subject: variant.subjectTemplate(goal),
      body: variant.bodyTemplate(goal, audience, tone),
    };
  }

  async generateSms(
    objective: string,
    segmentContext: string,
    regenerationIndex: number,
  ): Promise<SmsDraft> {
    const idx = regenerationIndex % SMS_VARIANTS.length;
    const template = SMS_VARIANTS[idx]!;
    let message = template(objective, segmentContext);

    // Enforce ≤160 characters — truncate at word boundary if needed
    message = truncateSms(message);

    return { message };
  }

  async generateChatbotScript(
    useCase: string,
    regenerationIndex: number,
  ): Promise<ChatbotScriptDraft> {
    const idx = regenerationIndex % CHATBOT_VARIANTS.length;
    const variant = CHATBOT_VARIANTS[idx]!;
    return {
      greeting: variant.greeting(useCase),
      qualification_questions: variant.questions(useCase),
      closing: variant.closing(useCase),
    };
  }
}

// ─── OpenAI adapter ───────────────────────────────────────────────────────────

export class OpenAiContentAdapter implements ContentAiAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  isAvailable(): boolean {
    return Boolean(this.apiKey);
  }

  private async callOpenAi(systemPrompt: string, userPrompt: string): Promise<string> {
    // Dynamic import to avoid hard dependency when not using OpenAI
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { default: OpenAI } = await import('openai' as any);
    const client = new OpenAI({ apiKey: this.apiKey });
    const completion = await client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    return (completion.choices[0]?.message?.content ?? '') as string;
  }

  async generateEmail(
    goal: string,
    audience: string,
    tone: string,
    regenerationIndex: number,
  ): Promise<EmailDraft> {
    const system = `You are an expert email copywriter. Generate marketing emails with {{merge_field}} placeholders like {{first_name}}, {{company_name}}, {{product_name}}, {{cta_link}}, {{unsubscribe_link}}. Respond with JSON: {"subject": "...", "body": "..."}`;
    const user = `Write a ${tone} marketing email for goal: "${goal}", targeting: "${audience}". Variation #${regenerationIndex + 1}.`;
    const raw = await this.callOpenAi(system, user);
    const parsed = JSON.parse(raw) as EmailDraft;
    return parsed;
  }

  async generateSms(
    objective: string,
    segmentContext: string,
    regenerationIndex: number,
  ): Promise<SmsDraft> {
    const system = `You are an SMS copywriter. Generate SMS messages ≤160 characters using {{merge_field}} placeholders like {{first_name}}. Respond with JSON: {"message": "..."}`;
    const user = `Write an SMS for objective: "${objective}", segment: "${segmentContext}". Variation #${regenerationIndex + 1}. Must be ≤160 chars.`;
    const raw = await this.callOpenAi(system, user);
    const parsed = JSON.parse(raw) as SmsDraft;
    parsed.message = truncateSms(parsed.message);
    return parsed;
  }

  async generateChatbotScript(
    useCase: string,
    regenerationIndex: number,
  ): Promise<ChatbotScriptDraft> {
    const system = `You are a chatbot script writer. Use {{merge_field}} placeholders like {{first_name}}, {{company_name}}. Respond with JSON: {"greeting": "...", "qualification_questions": ["...", "...", "..."], "closing": "..."}`;
    const user = `Write a chatbot script for use case: "${useCase}". Variation #${regenerationIndex + 1}.`;
    const raw = await this.callOpenAi(system, user);
    return JSON.parse(raw) as ChatbotScriptDraft;
  }
}

// ─── Unavailable adapter (for testing fallback) ───────────────────────────────

export class UnavailableContentAiAdapter implements ContentAiAdapter {
  isAvailable(): boolean {
    return false;
  }

  async generateEmail(
    _goal: string,
    _audience: string,
    _tone: string,
    _regenerationIndex: number,
  ): Promise<EmailDraft> {
    throw new Error('AI service unavailable');
  }

  async generateSms(
    _objective: string,
    _segmentContext: string,
    _regenerationIndex: number,
  ): Promise<SmsDraft> {
    throw new Error('AI service unavailable');
  }

  async generateChatbotScript(_useCase: string, _regenerationIndex: number): Promise<ChatbotScriptDraft> {
    throw new Error('AI service unavailable');
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Truncate SMS to ≤160 characters at a word boundary.
 * Merge field placeholders ({{...}}) are counted as-is.
 */
export function truncateSms(message: string): string {
  if (message.length <= 160) return message;

  // Truncate at last space before 157 to leave room for "..."
  const truncated = message.slice(0, 157);
  const lastSpace = truncated.lastIndexOf(' ');
  const cut = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
  return cut + '...';
}

/**
 * Extract all {{field_name}} merge field placeholders from a string.
 */
export function extractMergeFields(content: string): string[] {
  const matches = content.match(/\{\{[a-z_][a-z0-9_]*\}\}/g) ?? [];
  return [...new Set(matches)];
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createContentAiAdapter(
  provider: string,
  apiKey: string,
  model: string,
): ContentAiAdapter {
  if (provider === 'openai' && apiKey) {
    return new OpenAiContentAdapter(apiKey, model);
  }
  return new StubContentAiAdapter();
}
