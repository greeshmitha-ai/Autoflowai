export interface MarketingConfig {
  port: number;
  host: string;
  jwtPublicKey: string;
  kafkaBrokers: string[];
  /** Provider rate limit: max messages per second */
  providerRateLimit: number;
  /** Batch size for large campaigns */
  batchSize: number;
}

export function loadConfig(): MarketingConfig {
  return {
    port: parseInt(process.env['PORT'] ?? '3003', 10),
    host: process.env['HOST'] ?? '0.0.0.0',
    jwtPublicKey: process.env['JWT_PUBLIC_KEY'] ?? '',
    kafkaBrokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    providerRateLimit: parseInt(process.env['PROVIDER_RATE_LIMIT'] ?? '100', 10),
    batchSize: parseInt(process.env['CAMPAIGN_BATCH_SIZE'] ?? '1000', 10),
  };
}
