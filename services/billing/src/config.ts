export interface BillingConfig {
  port: number;
  host: string;
  jwtPublicKey: string;
  stripeSecretKey: string;
  stripeWebhookSecret: string;
  kafkaBrokers: string[];
  redisUrl: string;
  s3Bucket: string;
  s3Region: string;
}

export function loadConfig(): BillingConfig {
  return {
    port: parseInt(process.env['PORT'] ?? '3009', 10),
    host: process.env['HOST'] ?? '0.0.0.0',
    jwtPublicKey: process.env['JWT_PUBLIC_KEY'] ?? '',
    stripeSecretKey: process.env['STRIPE_SECRET_KEY'] ?? '',
    stripeWebhookSecret: process.env['STRIPE_WEBHOOK_SECRET'] ?? '',
    kafkaBrokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    s3Bucket: process.env['S3_BUCKET'] ?? 'platform-invoices',
    s3Region: process.env['AWS_REGION'] ?? 'us-east-1',
  };
}
