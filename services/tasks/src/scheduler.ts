/**
 * Scheduled jobs for Task Service:
 * - Hourly: check for tasks at/past due date; publish reminder and escalation events
 */
import { checkDueDateReminders } from './task.service.js';

export function startScheduler(kafkaBrokers: string[]): void {
  // Run once at startup after a short delay
  setTimeout(() => {
    void runDueDateCheck(kafkaBrokers);
  }, 10_000);

  // Hourly: check due dates
  setInterval(
    () => {
      void runDueDateCheck(kafkaBrokers);
    },
    60 * 60 * 1000,
  );
}

async function runDueDateCheck(kafkaBrokers: string[]): Promise<void> {
  try {
    await checkDueDateReminders(kafkaBrokers);
  } catch (err) {
    console.error('[Tasks Scheduler] Due-date check failed:', err);
  }
}
