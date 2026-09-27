export interface LiveChatConfig {
  port: number;
  host: string;
  jwtPublicKey: string;
  kafkaBrokers: string[];
  /** Seconds before escalation timeout fallback (default 300 = 5 minutes) */
  escalationTimeoutSeconds: number;
}

export function loadConfig(): LiveChatConfig {
  return {
    port: parseInt(process.env['PORT'] ?? '3015', 10),
    host: process.env['HOST'] ?? '0.0.0.0',
    jwtPublicKey: process.env['JWT_PUBLIC_KEY'] ?? '',
    kafkaBrokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    escalationTimeoutSeconds: parseInt(
      process.env['ESCALATION_TIMEOUT_SECONDS'] ?? '300',
      10,
    ),
  };
}
