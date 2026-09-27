import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Readable } from 'stream';

let s3Client: S3Client | null = null;

export function getS3Client(region?: string): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: region ?? process.env['AWS_REGION'] ?? 'us-east-1',
    });
  }
  return s3Client;
}

export async function uploadToS3(
  bucket: string,
  key: string,
  body: Buffer | Uint8Array | string,
  contentType = 'text/csv',
): Promise<string> {
  const client = getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return key;
}

export async function getS3ObjectStream(bucket: string, key: string): Promise<Readable> {
  const client = getS3Client();
  const response = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (!response.Body) {
    throw new Error(`S3 object not found: ${key}`);
  }
  return response.Body as Readable;
}

export async function getSignedDownloadUrl(
  bucket: string,
  key: string,
  expiresIn = 3600,
): Promise<string> {
  const client = getS3Client();
  return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn });
}
