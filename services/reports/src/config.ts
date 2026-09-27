export interface ReportsConfig {
  port: number;
  host: string;
  jwtPublicKey: string;
  redisUrl: string;
  kafkaBrokers: string[];
}

export function loadConfig(): ReportsConfig {
  return {
    port: parseInt(process.env['PORT'] ?? '3018', 10),
    host: process.env['HOST'] ?? '0.0.0.0',
    jwtPublicKey: process.env['JWT_PUBLIC_KEY'] ?? '',
    redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    kafkaBrokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
  };
}
