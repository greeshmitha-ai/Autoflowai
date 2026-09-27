/**
 * Export Service — PDF/PNG generation via Puppeteer, S3 upload stub, signed URL delivery.
 * Requirements: 32.1, 32.2
 */
import { eq, and } from 'drizzle-orm';
import {
  getDb,
  dashboardExportJobs,
  type DashboardExportJob,
  type NewDashboardExportJob,
} from '@platform/db';

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CreateExportJobInput {
  type: 'pdf' | 'png';
  source_url: string;
  report_name: string;
  tenant_name: string;
  date_range?: string;
}

// ─── S3 stub ──────────────────────────────────────────────────────────────────

/**
 * Upload buffer to S3 (stub — replace with real AWS SDK call in production).
 * Returns the S3 key.
 */
async function uploadToS3(
  tenantId: string,
  jobId: string,
  type: 'pdf' | 'png',
  buffer: Buffer,
): Promise<string> {
  const ext = type === 'pdf' ? 'pdf' : 'png';
  const key = `exports/${tenantId}/${jobId}.${ext}`;
  // Stub: in production, use @aws-sdk/client-s3 PutObjectCommand
  console.log(`[ExportService] S3 stub: uploading ${buffer.length} bytes to s3://${key}`);
  return key;
}

/**
 * Generate a signed S3 URL (stub — replace with real GetObjectCommand + presigner).
 * URL is valid for 1 hour.
 */
function generateSignedUrl(s3Key: string): string {
  const expiresAt = Date.now() + 3600 * 1000;
  return `https://s3.example.com/${s3Key}?X-Amz-Expires=3600&X-Amz-Signature=stub&expires=${expiresAt}`;
}

// ─── Puppeteer rendering ──────────────────────────────────────────────────────

/**
 * Render a URL to PDF using Puppeteer.
 * Includes tenant name, report name, date range, and export timestamp in the header.
 */
async function renderPdf(
  sourceUrl: string,
  reportName: string,
  tenantName: string,
  dateRange: string | null | undefined,
): Promise<Buffer> {
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(sourceUrl, { waitUntil: 'networkidle2', timeout: 30_000 });

    const exportTimestamp = new Date().toISOString();
    const headerLine = [
      tenantName,
      reportName,
      dateRange ?? '',
      `Exported: ${exportTimestamp}`,
    ]
      .filter(Boolean)
      .join('  |  ');

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="font-size:9px;color:#555;width:100%;padding:4px 20px;border-bottom:1px solid #ddd;font-family:sans-serif;">
          ${headerLine}
        </div>`,
      footerTemplate: `
        <div style="font-size:9px;color:#aaa;width:100%;text-align:center;padding:4px;">
          Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>`,
      margin: { top: '40px', bottom: '30px', left: '20px', right: '20px' },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

/**
 * Render a URL to PNG screenshot using Puppeteer.
 */
async function renderPng(sourceUrl: string): Promise<Buffer> {
  const puppeteer = await import('puppeteer');
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await page.goto(sourceUrl, { waitUntil: 'networkidle2', timeout: 30_000 });

    const screenshotBuffer = await page.screenshot({ fullPage: true, type: 'png' });
    return Buffer.from(screenshotBuffer);
  } finally {
    await browser.close();
  }
}

// ─── Job CRUD ─────────────────────────────────────────────────────────────────

export async function createExportJob(
  tenantId: string,
  userId: string,
  input: CreateExportJobInput,
): Promise<DashboardExportJob> {
  if (!input.type || !['pdf', 'png'].includes(input.type)) {
    throw new ValidationError('type must be pdf or png');
  }
  if (!input.source_url?.trim()) throw new ValidationError('source_url is required');
  if (!input.report_name?.trim()) throw new ValidationError('report_name is required');
  if (!input.tenant_name?.trim()) throw new ValidationError('tenant_name is required');

  const db = getDb();
  const newJob: NewDashboardExportJob = {
    tenant_id: tenantId,
    user_id: userId,
    type: input.type,
    status: 'pending',
    source_url: input.source_url.trim(),
    report_name: input.report_name.trim(),
    tenant_name: input.tenant_name.trim(),
    date_range: input.date_range?.trim() ?? null,
  };

  const [job] = await db.insert(dashboardExportJobs).values(newJob).returning();
  if (!job) throw new Error('Failed to create export job');
  return job;
}

export async function getExportJob(
  tenantId: string,
  jobId: string,
): Promise<DashboardExportJob> {
  const db = getDb();
  const [job] = await db
    .select()
    .from(dashboardExportJobs)
    .where(
      and(
        eq(dashboardExportJobs.tenant_id, tenantId),
        eq(dashboardExportJobs.job_id, jobId),
      ),
    )
    .limit(1);

  if (!job) throw new NotFoundError(`Export job ${jobId} not found`);
  return job;
}

// ─── Job processor ────────────────────────────────────────────────────────────

/**
 * Process an export job: render via Puppeteer, upload to S3, update job record.
 * On failure, stores error and sets partial_output_expires_at to 1 hour from now.
 * Requirement 32.2: notify user with signed URL on completion.
 */
export async function processExportJob(
  tenantId: string,
  jobId: string,
  notifyUser?: (job: DashboardExportJob, downloadUrl: string) => Promise<void>,
  notifyFailure?: (job: DashboardExportJob, error: string) => Promise<void>,
): Promise<DashboardExportJob> {
  const db = getDb();

  // Mark as processing
  await db
    .update(dashboardExportJobs)
    .set({ status: 'processing' })
    .where(
      and(
        eq(dashboardExportJobs.tenant_id, tenantId),
        eq(dashboardExportJobs.job_id, jobId),
      ),
    );

  const job = await getExportJob(tenantId, jobId);

  try {
    // Render
    let buffer: Buffer;
    if (job.type === 'pdf') {
      buffer = await renderPdf(
        job.source_url,
        job.report_name,
        job.tenant_name,
        job.date_range,
      );
    } else {
      buffer = await renderPng(job.source_url);
    }

    // Upload to S3
    const s3Key = await uploadToS3(tenantId, jobId, job.type as 'pdf' | 'png', buffer);
    const downloadUrl = generateSignedUrl(s3Key);

    // Mark completed
    const [completed] = await db
      .update(dashboardExportJobs)
      .set({
        status: 'completed',
        s3_key: s3Key,
        download_url: downloadUrl,
        completed_at: new Date(),
      })
      .where(
        and(
          eq(dashboardExportJobs.tenant_id, tenantId),
          eq(dashboardExportJobs.job_id, jobId),
        ),
      )
      .returning();

    if (!completed) throw new Error('Failed to update job to completed');

    // Notify user (Req 32.2)
    if (notifyUser) {
      await notifyUser(completed, downloadUrl).catch((err) => {
        console.error('[ExportService] Failed to notify user on completion', err);
      });
    }

    return completed;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const partialExpiry = new Date(Date.now() + 3600 * 1000); // 1 hour

    const [failed] = await db
      .update(dashboardExportJobs)
      .set({
        status: 'failed',
        error: errorMessage,
        partial_output_expires_at: partialExpiry,
        completed_at: new Date(),
      })
      .where(
        and(
          eq(dashboardExportJobs.tenant_id, tenantId),
          eq(dashboardExportJobs.job_id, jobId),
        ),
      )
      .returning();

    if (failed && notifyFailure) {
      await notifyFailure(failed, errorMessage).catch((e) => {
        console.error('[ExportService] Failed to notify user on failure', e);
      });
    }

    return failed ?? job;
  }
}
