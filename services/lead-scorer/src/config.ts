export interface LeadScorerConfig {
  port: number;
  host: string;
  jwtPublicKey: string;
  kafkaBrokers: string[];
  redisUrl: string;
  databaseUrl: string;
}

export function loadConfig(): LeadScorerConfig {
  return {
    port: parseInt(process.env['PORT'] ?? '3012', 10),
    host: process.env['HOST'] ?? '0.0.0.0',
    jwtPublicKey: process.env['JWT_PUBLIC_KEY'] ?? '',
    kafkaBrokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    databaseUrl: process.env['DATABASE_URL'] ?? 'postgresql://localhost:5432/platform',
  };
}
