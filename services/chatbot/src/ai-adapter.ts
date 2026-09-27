/**
 * AI Adapter — pluggable interface for LLM providers.
 * Swap out the stub for OpenAI or Anthropic by setting AI_PROVIDER env var.
 */

export interface AiMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface AiResponse {
  content: string;
  /** Confidence score 0–1 (model-provided or estimated) */
  confidence: number;
  /** Whether the AI service was available */
  available: boolean;
}

export interface AiAdapter {
  chat(messages: AiMessage[], systemPrompt?: string): Promise<AiResponse>;
}

// ─── Stub adapter (default) ───────────────────────────────────────────────────

export class StubAiAdapter implements AiAdapter {
  async chat(messages: AiMessage[], systemPrompt?: string): Promise<AiResponse> {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    const userText = lastUserMsg?.content ?? '';

    // Simulate a basic response
    const response = systemPrompt
      ? `[AI] I'm here to help. You said: "${userText}"`
      : `[AI] Hello! How can I assist you today? You asked: "${userText}"`;

    return {
      content: response,
      confidence: 0.85,
      available: true,
    };
  }
}

// ─── OpenAI adapter stub (wire to real SDK) ───────────────────────────────────

export class OpenAiAdapter implements AiAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async chat(messages: AiMessage[], systemPrompt?: string): Promise<AiResponse> {
    // TODO: wire to openai npm package
    // import OpenAI from 'openai';
    // const client = new OpenAI({ apiKey: this.apiKey });
    // const allMessages = systemPrompt
    //   ? [{ role: 'system', content: systemPrompt }, ...messages]
    //   : messages;
    // const completion = await client.chat.completions.create({
    //   model: this.model,
    //   messages: allMessages,
    // });
    // return { content: completion.choices[0].message.content ?? '', confidence: 0.9, available: true };

    void this.apiKey;
    void this.model;
    void messages;
    void systemPrompt;
    throw new Error('OpenAI adapter not yet wired — set AI_PROVIDER=stub or install openai package');
  }
}

// ─── Anthropic adapter stub (wire to real SDK) ────────────────────────────────

export class AnthropicAdapter implements AiAdapter {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async chat(messages: AiMessage[], systemPrompt?: string): Promise<AiResponse> {
    // TODO: wire to @anthropic-ai/sdk package
    void this.apiKey;
    void this.model;
    void messages;
    void systemPrompt;
    throw new Error('Anthropic adapter not yet wired — set AI_PROVIDER=stub or install @anthropic-ai/sdk');
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createAiAdapter(provider: string, apiKey: string, model: string): AiAdapter {
  switch (provider) {
    case 'openai':
      return new OpenAiAdapter(apiKey, model);
    case 'anthropic':
      return new AnthropicAdapter(apiKey, model);
    default:
      return new StubAiAdapter();
  }
}
