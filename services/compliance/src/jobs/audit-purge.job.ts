import cron from 'node-cron';
import { lt } from 'drizzle-orm';
import { getDb, auditLogs } from '@platform/db';

const RETENTION_DAYS = 90;

/**
 * Deletes audit_logs older than 90 days.
 * Runs daily at 02:00 UTC.
 */
export async function purgeOldAuditLogs(): Promise<number> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - RETENTION_DAYS);

  const db = getDb();
  const result = await db
    .delete(auditLogs)
    .where(lt(auditLogs.timestamp, cutoff))
    .returning({ audit_id: auditLogs.audit_id });

  return result.length;
}

export function startAuditPurgeJob(): cron.ScheduledTask {
  // Run daily at 02:00 UTC
  return cron.schedule('0 2 * * *', async () => {
    try {
      const deleted = await purgeOldAuditLogs();
      console.log(`[audit-purge] Deleted ${deleted} audit log entries older than ${RETENTION_DAYS} days`);
    } catch (err) {
      console.error('[audit-purge] Failed to purge audit logs:', err);
    }
  });
}
