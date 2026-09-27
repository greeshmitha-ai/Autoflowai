export interface ContactConfig {
  port: number;
  host: string;
  /** JWT public key for verifying tokens from the gateway */
  jwtPublicKey: string;
  /** Elasticsearch node URL */
  elasticsearchUrl: string;
  /** S3 bucket for CSV imports */
  s3Bucket: string;
  /** S3 region */
  s3Region: string;
  /** Kafka brokers */
  kafkaBrokers: string[];
}

export function loadConfig(): ContactConfig {
  return {
    port: parseInt(process.env['PORT'] ?? '3002', 10),
    host: process.env['HOST'] ?? '0.0.0.0',
    jwtPublicKey: process.env['JWT_PUBLIC_KEY'] ?? '',
    elasticsearchUrl: process.env['ELASTICSEARCH_URL'] ?? 'http://localhost:9200',
    s3Bucket: process.env['S3_BUCKET'] ?? 'platform-imports',
    s3Region: process.env['AWS_REGION'] ?? 'us-east-1',
    kafkaBrokers: (process.env['KAFKA_BROKERS'] ?? 'localhost:9092').split(','),
  };
}
