/**
 * Scheduled jobs for CRM:
 * - Daily: detect and flag overdue deals, notify deal owners
 */
import { detectAndFlagOverdueDeals } from './crm.service.js';

export function startScheduler(kafkaBrokers: string[]): void {
  // Run once at startup (after a short delay to let DB connect)
  setTimeout(() => {
    void runOverdueDetection(kafkaBrokers);
  }, 5000);

  // Daily: detect overdue deals
  setInterval(
    () => {
      void runOverdueDetection(kafkaBrokers);
    },
    24 * 60 * 60 * 1000,
  );
}

async function runOverdueDetection(kafkaBrokers: string[]): Promise<void> {
  try {
    const result = await detectAndFlagOverdueDeals(kafkaBrokers);
    if (result.flagged > 0) {
      console.log(`[CRM Scheduler] Flagged ${result.flagged} overdue deals`);
    }
  } catch (err) {
    console.error('[CRM Scheduler] Overdue detection failed:', err);
  }
}
