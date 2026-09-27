import cron from 'node-cron';
import { ContactService } from './contact.service.js';
import type { Client as ElasticsearchClient } from '@elastic/elasticsearch';

/**
 * Scheduled job that purges PII fields for contacts where erasure was
 * requested more than 30 days ago. Runs daily at 02:00 UTC.
 */
export function startPiiErasureCron(
  esClient: ElasticsearchClient,
  kafkaBrokers: string[],
): cron.ScheduledTask {
  const service = new ContactService(esClient, kafkaBrokers);

  const task = cron.schedule('0 2 * * *', async () => {
    try {
      const purgedCount = await service.purgePiiFields();
      if (purgedCount > 0) {
        console.log(`[PII Erasure] Purged PII fields for ${purgedCount} contacts`);
      }
    } catch (err) {
      console.error('[PII Erasure] Cron job failed:', err);
    }
  });

  return task;
}
