import { parse } from 'csv-parse';
import { eq, and } from 'drizzle-orm';
import { getDb, importJobs, contacts, type NewContact } from '@platform/db';
import { createPublisher } from '@platform/events';
import { getS3ObjectStream } from './s3.js';
import { isValidEmail } from './email-validator.js';

const BATCH_SIZE = 1_000;

export interface ImportWorkerConfig {
  s3Bucket: string;
  kafkaBrokers: string[];
}

export async function processImportJob(
  jobId: string,
  tenantId: string,
  config: ImportWorkerConfig,
): Promise<void> {
  const db = getDb();

  // Mark job as processing
  await db
    .update(importJobs)
    .set({ status: 'processing', updated_at: new Date() })
    .where(and(eq(importJobs.job_id, jobId), eq(importJobs.tenant_id, tenantId)));

  // Fetch job record
  const [job] = await db
    .select()
    .from(importJobs)
    .where(and(eq(importJobs.job_id, jobId), eq(importJobs.tenant_id, tenantId)))
    .limit(1);

  if (!job) {
    throw new Error(`Import job not found: ${jobId}`);
  }

  let successCount = 0;
  let errorCount = 0;
  const errorDetails: string[] = [];

  try {
    const stream = await getS3ObjectStream(config.s3Bucket, job.s3_key);

    const parser = stream.pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }),
    );

    let batch: NewContact[] = [];
    let rowIndex = 0;

    for await (const row of parser) {
      rowIndex++;
      const record = row as Record<string, string>;

      // Validate email if present
      if (record['email'] && !isValidEmail(record['email'])) {
        errorCount++;
        errorDetails.push(`Row ${rowIndex}: invalid email "${record['email']}"`);
        continue;
      }

      const leadScore = record['lead_score'] ? parseInt(record['lead_score'], 10) : 50;
      const validLeadScore =
        !isNaN(leadScore) && leadScore >= 0 && leadScore <= 100 ? leadScore : 50;

      const contact: NewContact = {
        tenant_id: tenantId,
        full_name: record['full_name'] ?? record['name'] ?? null,
        email: record['email'] ?? null,
        phone: record['phone'] ?? null,
        company_name: record['company_name'] ?? record['company'] ?? null,
        tags: record['tags'] ? record['tags'].split(';').map((t) => t.trim()) : [],
        lifecycle_stage: record['lifecycle_stage'] ?? null,
        lead_score: validLeadScore,
        lead_score_confidence: 'low',
      };

      batch.push(contact);

      if (batch.length >= BATCH_SIZE) {
        const inserted = await insertBatch(tenantId, batch);
        successCount += inserted;
        batch = [];
      }
    }

    // Insert remaining records
    if (batch.length > 0) {
      const inserted = await insertBatch(tenantId, batch);
      successCount += inserted;
    }

    // Mark job as completed
    await db
      .update(importJobs)
      .set({
        status: 'completed',
        total_rows: rowIndex,
        success_count: successCount,
        error_count: errorCount,
        error_details: errorDetails.length > 0 ? errorDetails.slice(0, 100).join('\n') : null,
        updated_at: new Date(),
        completed_at: new Date(),
      })
      .where(eq(importJobs.job_id, jobId));

    // Publish completion event
    await publishImportEvent(tenantId, jobId, rowIndex, successCount, errorCount, config.kafkaBrokers);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    await db
      .update(importJobs)
      .set({
        status: 'failed',
        error_details: errorMessage,
        updated_at: new Date(),
        completed_at: new Date(),
      })
      .where(eq(importJobs.job_id, jobId));

    // Publish failure event
    await publishImportEvent(tenantId, jobId, 0, successCount, errorCount, config.kafkaBrokers, errorMessage);

    throw err;
  }
}

async function insertBatch(tenantId: string, batch: NewContact[]): Promise<number> {
  if (batch.length === 0) return 0;
  const db = getDb();
  try {
    const result = await db.insert(contacts).values(batch).returning({ id: contacts.contact_id });
    return result.length;
  } catch (err) {
    console.error(`Failed to insert batch for tenant ${tenantId}:`, err);
    return 0;
  }
}

async function publishImportEvent(
  tenantId: string,
  jobId: string,
  totalRows: number,
  successCount: number,
  errorCount: number,
  kafkaBrokers: string[],
  _error?: string,
): Promise<void> {
  try {
    const publisher = createPublisher(tenantId, { brokers: kafkaBrokers });
    await publisher.connect();
    await publisher.publish('contacts', 'contact.import.completed', {
      job_id: jobId,
      total_rows: totalRows,
      success_count: successCount,
      error_count: errorCount,
    });
    await publisher.disconnect();
  } catch (err) {
    console.error('Failed to publish import completion event:', err);
  }
}
