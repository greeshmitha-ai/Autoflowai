import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

let s3Client: S3Client | null = null;

export function getS3Client(region: string): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({ region });
  }
  return s3Client;
}

export async function uploadKnowledgeDocument(
  bucket: string,
  region: string,
  agentId: string,
  filename: string,
  body: Buffer,
  contentType: string,
): Promise<string> {
  const client = getS3Client(region);
  const ext = filename.split('.').pop() ?? 'bin';
  const s3Key = `knowledge/${agentId}/${randomUUID()}.${ext}`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: body,
      ContentType: contentType,
      Metadata: { original_filename: filename, agent_id: agentId },
    }),
  );

  return s3Key;
}

export async function getSignedDownloadUrl(
  bucket: string,
  region: string,
  s3Key: string,
  expiresInSeconds = 3600,
): Promise<string> {
  const client = getS3Client(region);
  const command = new GetObjectCommand({ Bucket: bucket, Key: s3Key });
  return getSignedUrl(client, command, { expiresIn: expiresInSeconds });
}
