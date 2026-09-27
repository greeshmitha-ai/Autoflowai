import { eq, and } from 'drizzle-orm';
import { randomUUID } from 'crypto';
import { createWriteStream, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import archiver from 'archiver';
import { getDb, exportJobs, contacts, auditLogs } from '@platform/db';
import type { ExportJob } from '@platform/db';

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

/**
 * Creates an export job record and kicks off async processing.
 */
export async function createExportJob(
  tenantId: string,
  requestedBy: string,
): Promise<ExportJob> {
  const db = getDb();
  const [job] = await db
    .insert(exportJobs)
    .values({ tenant_id: tenantId, requested_by: requestedBy, status: 'pending' })
    .returning();
  if (!job) throw new Error('Failed to create export job');

  // Fire-and-forget async processing
  void processExportJob(job.job_id, tenantId);

  return job;
}

export async function getExportJob(tenantId: string, jobId: string): Promise<ExportJob> {
  const db = getDb();
  const [job] = await db
    .select()
    .from(exportJobs)
    .where(and(eq(exportJobs.job_id, jobId), eq(exportJobs.tenant_id, tenantId)));
  if (!job) throw new NotFoundError(`Export job ${jobId} not found`);
  return job;
}

/**
 * Collects all tenant data, packages as ZIP, stores in S3 (stubbed),
 * and notifies the tenant owner with a signed download URL.
 */
async function processExportJob(jobId: string, tenantId: string): Promise<void> {
  const db = getDb();

  try {
    // Mark as processing
    await db
      .update(exportJobs)
      .set({ status: 'processing' })
      .where(eq(exportJobs.job_id, jobId));

    // Collect tenant data
    const [tenantContacts, tenantAuditLogs] = await Promise.all([
      db.select().from(contacts).where(eq(contacts.tenant_id, tenantId)),
      db.select().from(auditLogs).where(eq(auditLogs.tenant_id, tenantId)),
    ]);

    // Build ZIP in temp directory
    const tmpDir = join(tmpdir(), `export-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
    const zipPath = join(tmpDir, 'export.zip');

    await buildZip(zipPath, {
      'contacts.json': JSON.stringify(tenantContacts, null, 2),
      'audit_logs.json': JSON.stringify(tenantAuditLogs, null, 2),
    });

    // Stub: upload to S3 and generate signed URL
    const s3Key = `exports/${tenantId}/${jobId}/export.zip`;
    const downloadUrl = await uploadToS3Stub(zipPath, s3Key);

    // Cleanup temp files
    rmSync(tmpDir, { recursive: true, force: true });

    // Mark completed
    await db
      .update(exportJobs)
      .set({ status: 'completed', s3_key: s3Key, download_url: downloadUrl, completed_at: new Date() })
      .where(eq(exportJobs.job_id, jobId));

    // Stub: notify tenant owner
    notifyTenantOwnerStub(tenantId, downloadUrl);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db
      .update(exportJobs)
      .set({ status: 'failed', error: message, completed_at: new Date() })
      .where(eq(exportJobs.job_id, jobId));
  }
}

function buildZip(outputPath: string, files: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', resolve);
    archive.on('error', reject);
    archive.pipe(output);

    for (const [name, content] of Object.entries(files)) {
      archive.append(content, { name });
    }

    void archive.finalize();
  });
}

/**
 * Stub: In production, upload to S3 and return a pre-signed URL valid for 48 hours.
 */
async function uploadToS3Stub(localPath: string, s3Key: string): Promise<string> {
  console.log(`[export] Stub: would upload ${localPath} to s3://${s3Key}`);
  const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  return `https://s3.example.com/${s3Key}?expires=${expiresAt}`;
}

/**
 * Stub: In production, send email via Notification Service.
 * Requirement: notify within 48 hours.
 */
function notifyTenantOwnerStub(tenantId: string, downloadUrl: string): void {
  console.log(`[export] Stub: notify tenant ${tenantId} owner — download URL: ${downloadUrl}`);
}
