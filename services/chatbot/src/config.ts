export interface ChatbotConfig {
  port: number;
  host: string;
  jwtPublicKey: string;
  kafkaBrokers: string[];
  s3Bucket: string;
  s3Region: string;
  /** AI provider: 'openai' | 'anthropic' | 'stub' */
  aiProvider: string;
  aiApiKey: string;
  aiModel: string;
}

export function loadConfig(): ChatbotConfig {
  return {
    port: parseInt(process.env['PORT'] ?? '3004', 10),
    host: process.env['HOST'] ?? '0.0.0.0',
    jwtPublicKey: process.env['JWT_PUBLIC_KEY'] ?? '',
    kafkaBrokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    s3Bucket: process.env['S3_BUCKET'] ?? 'platform-knowledge',
    s3Region: process.env['AWS_REGION'] ?? 'us-east-1',
    aiProvider: process.env['AI_PROVIDER'] ?? 'stub',
    aiApiKey: process.env['AI_API_KEY'] ?? '',
    aiModel: process.env['AI_MODEL'] ?? 'gpt-4o',
  };
}
