export interface AttributionConfig {
  port: number;
  host: string;
  jwtPublicKey: string;
  kafkaBrokers: string[];
}

export function loadConfig(): AttributionConfig {
  return {
    port: parseInt(process.env['PORT'] ?? '3019', 10),
    host: process.env['HOST'] ?? '0.0.0.0',
    jwtPublicKey: process.env['JWT_PUBLIC_KEY'] ?? '',
    kafkaBrokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
  };
}
