/**
 * In-memory delivery queue with rate-limit-aware batch processing.
 * For production, this would be backed by Redis or a proper queue (BullMQ, etc.).
 */

export interface DeliveryJob {
  jobId: string;
  campaignId: string;
  tenantId: string;
  contactIds: string[];
  channel: 'email' | 'sms' | 'in_app';
  scheduledAt?: Date;
}

export interface DeliveryBatch {
  batchId: string;
  jobId: string;
  campaignId: string;
  tenantId: string;
  contactIds: string[];
  channel: 'email' | 'sms' | 'in_app';
}

type BatchProcessor = (batch: DeliveryBatch) => Promise<void>;

export class DeliveryQueue {
  private queue: DeliveryBatch[] = [];
  private processing = false;
  private processor: BatchProcessor;
  /** Max messages per second */
  private rateLimit: number;
  private batchSize: number;

  constructor(processor: BatchProcessor, rateLimit = 100, batchSize = 1000) {
    this.processor = processor;
    this.rateLimit = rateLimit;
    this.batchSize = batchSize;
  }

  /**
   * Enqueue a delivery job, splitting into batches of batchSize for large campaigns.
   */
  enqueue(job: DeliveryJob): void {
    const { contactIds, ...rest } = job;

    // Split into batches of batchSize (required for > 10,000 recipients)
    for (let i = 0; i < contactIds.length; i += this.batchSize) {
      const slice = contactIds.slice(i, i + this.batchSize);
      this.queue.push({
        batchId: `${job.jobId}-batch-${Math.floor(i / this.batchSize)}`,
        contactIds: slice,
        ...rest,
      });
    }

    if (!this.processing) {
      void this.processQueue();
    }
  }

  private async processQueue(): Promise<void> {
    this.processing = true;

    while (this.queue.length > 0) {
      const batch = this.queue.shift();
      if (!batch) break;

      try {
        await this.processor(batch);
      } catch (err) {
        console.error(`Failed to process batch ${batch.batchId}:`, err);
      }

      // Rate limiting: wait between batches to respect provider limits
      // rateLimit = messages/sec; batchSize contacts per batch
      const delayMs = Math.ceil((batch.contactIds.length / this.rateLimit) * 1000);
      if (delayMs > 0 && this.queue.length > 0) {
        await sleep(delayMs);
      }
    }

    this.processing = false;
  }

  get pendingBatches(): number {
    return this.queue.length;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
