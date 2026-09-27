export interface ContentAssistantConfig {
  port: number;
  host: string;
  jwtPublicKey: string;
  /** AI provider: 'openai' | 'stub' */
  aiProvider: string;
  aiApiKey: string;
  aiModel: string;
  /** Generation timeout in milliseconds (default 10s) */
  generationTimeoutMs: number;
}

export function loadConfig(): ContentAssistantConfig {
  return {
    port: parseInt(process.env['PORT'] ?? '3012', 10),
    host: process.env['HOST'] ?? '0.0.0.0',
    jwtPublicKey: process.env['JWT_PUBLIC_KEY'] ?? '',
    aiProvider: process.env['OPENAI_API_KEY'] ? 'openai' : (process.env['AI_PROVIDER'] ?? 'stub'),
    aiApiKey: process.env['OPENAI_API_KEY'] ?? process.env['AI_API_KEY'] ?? '',
    aiModel: process.env['AI_MODEL'] ?? 'gpt-4o',
    generationTimeoutMs: parseInt(process.env['GENERATION_TIMEOUT_MS'] ?? '10000', 10),
  };
}
