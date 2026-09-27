export interface CallConfig {
  port: number;
  host: string;
  jwtPublicKey: string;
  kafkaBrokers: string[];
  twilioAccountSid: string;
  twilioAuthToken: string;
  twilioPhoneNumber: string;
  s3Bucket: string;
  s3Region: string;
  webhookBaseUrl: string;
}

export function loadConfig(): CallConfig {
  return {
    port: parseInt(process.env['PORT'] ?? '3006', 10),
    host: process.env['HOST'] ?? '0.0.0.0',
    jwtPublicKey: process.env['JWT_PUBLIC_KEY'] ?? '',
    kafkaBrokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    twilioAccountSid: process.env['TWILIO_ACCOUNT_SID'] ?? '',
    twilioAuthToken: process.env['TWILIO_AUTH_TOKEN'] ?? '',
    twilioPhoneNumber: process.env['TWILIO_PHONE_NUMBER'] ?? '',
    s3Bucket: process.env['S3_BUCKET'] ?? 'platform-recordings',
    s3Region: process.env['S3_REGION'] ?? 'us-east-1',
    webhookBaseUrl: process.env['WEBHOOK_BASE_URL'] ?? 'https://api.example.com',
  };
}
