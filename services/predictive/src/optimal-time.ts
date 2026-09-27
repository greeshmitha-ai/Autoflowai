/**
 * Optimal contact time recommendation.
 *
 * Computes the best day-of-week (0=Sun … 6=Sat) and hour-of-day (0–23)
 * for a contact based on historical response patterns:
 *   - Calls answered (call.completed with direction=inbound or outbound answered)
 *   - Emails opened (campaign.opened events)
 *
 * Confidence is based on the number of data points available.
 */

export interface ResponseEvent {
  /** Day of week: 0 (Sunday) – 6 (Saturday) */
  dayOfWeek: number;
  /** Hour of day: 0–23 */
  hourOfDay: number;
}

export interface OptimalTimeResult {
  best_day_of_week: number;
  best_hour_of_day: number;
  /** Confidence in [0, 1] based on sample size */
  confidence: number;
}

/**
 * Compute the optimal contact time from a list of historical response events.
 * Falls back to Tuesday 10:00 AM with zero confidence when no data.
 */
export function computeOptimalTime(events: ResponseEvent[]): OptimalTimeResult {
  if (events.length === 0) {
    return { best_day_of_week: 2, best_hour_of_day: 10, confidence: 0 };
  }

  // Count occurrences per (day, hour) bucket
  const buckets = new Map<string, number>();
  for (const ev of events) {
    const key = `${ev.dayOfWeek}:${ev.hourOfDay}`;
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  // Find the bucket with the highest count
  let bestKey = '';
  let bestCount = 0;
  for (const [key, count] of buckets) {
    if (count > bestCount) {
      bestCount = count;
      bestKey = key;
    }
  }

  const [dayStr, hourStr] = bestKey.split(':') as [string, string];
  const best_day_of_week = parseInt(dayStr, 10);
  const best_hour_of_day = parseInt(hourStr, 10);

  // Confidence: saturates at 1.0 with 20+ events
  const confidence = Math.min(events.length / 20, 1);

  return { best_day_of_week, best_hour_of_day, confidence };
}
