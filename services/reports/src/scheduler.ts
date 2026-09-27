/**
 * Scheduled report email delivery.
 * Daily check: find schedules with next_run_at <= now, execute report, email recipients.
 * Requirements: 23.6
 */
import { lte, eq, and } from 'drizzle-orm';
import { getDb, reportSchedules, reports } from '@platform/db';
import { executeReport, computeNextRunAt } from './report.service.js';

export function startScheduler(): void {
  // Run daily check every hour (to catch any missed runs)
  setInterval(
    async () => {
      await runDueSchedules();
    },
    60 * 60 * 1000,
  );

  // Also run immediately on startup
  runDueSchedules().catch((err) => {
    console.error('[ReportScheduler] Initial run failed:', err);
  });
}

async function runDueSchedules(): Promise<void> {
  const db = getDb();
  const now = new Date();

  const dueSchedules = await db
    .select()
    .from(reportSchedules)
    .where(lte(reportSchedules.next_run_at, now));

  for (const schedule of dueSchedules) {
    try {
      await deliverScheduledReport(schedule);

      // Advance next_run_at
      const nextRunAt = computeNextRunAt(schedule.frequency);
      await db
        .update(reportSchedules)
        .set({ next_run_at: nextRunAt })
        .where(eq(reportSchedules.schedule_id, schedule.schedule_id));
    } catch (err) {
      console.error(`[ReportScheduler] Failed to deliver schedule ${schedule.schedule_id}:`, err);
    }
  }
}

async function deliverScheduledReport(
  schedule: typeof reportSchedules.$inferSelect,
): Promise<void> {
  // Execute the report
  const reportData = await executeReport(schedule.tenant_id, schedule.report_id);

  // Get report name
  const db = getDb();
  const [report] = await db
    .select({ name: reports.name })
    .from(reports)
    .where(
      and(
        eq(reports.tenant_id, schedule.tenant_id),
        eq(reports.report_id, schedule.report_id),
      ),
    )
    .limit(1);

  const reportName = report?.name ?? 'Report';

  // Email stub — send to each recipient
  for (const recipient of schedule.recipients) {
    await sendReportEmail(recipient, reportName, reportData, schedule.frequency);
  }
}

async function sendReportEmail(
  recipient: string,
  reportName: string,
  reportData: Awaited<ReturnType<typeof executeReport>>,
  frequency: string,
): Promise<void> {
  // Email delivery stub (SendGrid-compatible)
  console.log(
    `[ReportScheduler] EMAIL stub: to=${recipient} subject="${frequency} Report: ${reportName}" ` +
    `visualizations=${reportData.visualizations.length} executed_at=${reportData.executed_at}`,
  );
}
