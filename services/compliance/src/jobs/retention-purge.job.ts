import cron from 'node-cron';
import { runRetentionPurge } from '../retention.service.js';

/**
 * Scheduled job that purges records older than configured retention period per resource type.
 * Runs daily at 03:00 UTC.
 */
export function startRetentionPurgeJob(): cron.ScheduledTask {
  return cron.schedule('0 3 * * *', async () => {
    console.log('[retention-purge] Starting scheduled retention purge...');
    try {
      await runRetentionPurge();
      console.log('[retention-purge] Retention purge completed');
    } catch (err) {
      console.error('[retention-purge] Retention purge failed:', err);
    }
  });
}
