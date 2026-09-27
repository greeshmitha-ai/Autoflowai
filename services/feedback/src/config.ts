export interface FeedbackConfig {
  port: number;
  host: string;
  jwtPublicKey: string;
  kafkaBrokers: string[];
  publicBaseUrl: string;
}

export function loadConfig(): FeedbackConfig {
  return {
    port: parseInt(process.env['PORT'] ?? '3007', 10),
    host: process.env['HOST'] ?? '0.0.0.0',
    jwtPublicKey: process.env['JWT_PUBLIC_KEY'] ?? '',
    kafkaBrokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    publicBaseUrl: process.env['PUBLIC_BASE_URL'] ?? 'https://app.example.com',
  };
}
