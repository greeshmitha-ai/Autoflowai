export interface ComplianceConfig {
  port: number;
  host: string;
  jwtPublicKey: string;
  kafkaBrokers: string[];
  s3Bucket: string;
  s3Region: string;
}

export function loadConfig(): ComplianceConfig {
  return {
    port: parseInt(process.env['PORT'] ?? '3009', 10),
    host: process.env['HOST'] ?? '0.0.0.0',
    jwtPublicKey: process.env['JWT_PUBLIC_KEY'] ?? '',
    kafkaBrokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
    s3Bucket: process.env['S3_BUCKET'] ?? 'platform-exports',
    s3Region: process.env['AWS_REGION'] ?? 'us-east-1',
  };
}
