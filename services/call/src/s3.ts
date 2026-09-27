import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export function createS3Client(region: string): S3Client {
  return new S3Client({ region });
}

export async function uploadRecording(
  bucket: string,
  region: string,
  callId: string,
  body: Buffer,
  contentType = 'audio/mpeg',
): Promise<string> {
  const client = createS3Client(region);
  const key = `recordings/${callId}.mp3`;

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );

  return `s3://${bucket}/${key}`;
}

export async function getSignedRecordingUrl(
  bucket: string,
  region: string,
  callId: string,
  expiresIn = 3600,
): Promise<string> {
  const client = createS3Client(region);
  const key = `recordings/${callId}.mp3`;

  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn },
  );
}
