export interface CollaborationConfig {
  port: number;
  host: string;
  jwtPublicKey: string;
  kafkaBrokers: string[];
}

export function loadConfig(): CollaborationConfig {
  return {
    port: parseInt(process.env['PORT'] ?? '3016', 10),
    host: process.env['HOST'] ?? '0.0.0.0',
    jwtPublicKey: process.env['JWT_PUBLIC_KEY'] ?? '',
    kafkaBrokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
  };
}
