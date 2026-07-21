import { getDb } from '@/db/client';

export interface NightlySleep {
  /** 'YYYY-MM-DD' - the local date the sleep window STARTED on */
  nightDate: string;
  /** null when tracking didn't cover the window, so no duration can be claimed */
  durationMinutes: number | null;
}

/** The finished result of one sleep-window occurrence, as recorded natively. */
export interface LastSleep {
  /** 'YYYY-MM-DD' - local date the window STARTED on */
  nightDate: string;
  bedTime: Date;
  wakeTime: Date;
  /** null when the occurrence is 'incomplete' - tracking didn't cover the window */
  durationMinutes: number | null;
  status: 'finalized' | 'incomplete';
}

/**
 * Returns the most recently completed sleep-window occurrence, or null when
 * none has completed yet.
 *
 * Reads the `sleep_sessions` row the native side wrote when the window closed,
 * rather than re-deriving "which night was that" from the clock. That is what
 * makes this correct for BOTH window shapes without special-casing either:
 *
 *   10:10 -> 11:33  same-day window
 *   23:00 -> 07:00  crosses midnight
 *
 * The old approach asked for "yesterday" and computed a window from it, which
 * missed a same-day window entirely and disagreed with what the wake-up
 * notification reported.
 */
export async function getLastCompletedSleep(): Promise<LastSleep | null> {
  const db = await getDb();

  const row = await db.getFirstAsync<{
    bed_time: string;
    wake_time: string;
    duration_minutes: number | null;
    status: string;
  }>(
    `SELECT bed_time, wake_time, duration_minutes, status FROM sleep_sessions
     WHERE status IN ('finalized', 'incomplete')
     ORDER BY wake_time DESC LIMIT 1;`
  );

  if (!row) return null;

  const bedTime = new Date(row.bed_time);
  const wakeTime = new Date(row.wake_time);

  return {
    nightDate: toLocalDateKey(bedTime),
    bedTime,
    wakeTime,
    durationMinutes: row.status === 'incomplete' ? null : row.duration_minutes,
    status: row.status === 'incomplete' ? 'incomplete' : 'finalized',
  };
}

function toLocalDateKey(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Returns the last `nights` COMPLETED sleep windows (default 7), most recent
 * last - the order a left-to-right weekly bar chart wants.
 *
 * Reads the recorded `sleep_sessions` occurrences, the same source as the card
 * and the wake-up notification, so all three always agree. The older approach
 * walked back N calendar dates and recomputed a window for each, which produced
 * nothing at all for a same-day window and disagreed with what was notified.
 *
 * Occurrences are keyed by the date the window STARTED. A window that is still
 * in progress is excluded - it has no duration to plot yet.
 */
export async function getRecentSleepWindows(nights: number = 7): Promise<NightlySleep[]> {
  const db = await getDb();

  const rows = await db.getAllAsync<{
    bed_time: string;
    duration_minutes: number | null;
    status: string;
  }>(
    `SELECT bed_time, duration_minutes, status FROM sleep_sessions
     WHERE status IN ('finalized', 'incomplete')
     ORDER BY wake_time DESC LIMIT ?;`,
    [nights]
  );

  // Oldest first for the chart's left-to-right reading order.
  return rows.reverse().map((row) => ({
    nightDate: toLocalDateKey(new Date(row.bed_time)),
    // 'incomplete' means tracking didn't cover the window - render it as a gap
    // rather than a bar, the same way the card refuses to claim a number.
    durationMinutes: row.status === 'incomplete' ? null : row.duration_minutes,
  }));
}

