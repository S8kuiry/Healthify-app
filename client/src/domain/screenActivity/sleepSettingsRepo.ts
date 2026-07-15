import { getDb } from '@/db/client';

export interface SleepSettings {
  /** 'HH:mm', 24-hour, e.g. '23:00' */
  windowStart: string;
  /** 'HH:mm', 24-hour, e.g. '07:00' */
  windowEnd: string;
}

function rowToSettings(row: any): SleepSettings {
  return {
    windowStart: row.window_start,
    windowEnd: row.window_end,
  };
}

/**
 * Returns the current sleep window. The seed row inserted by runMigrations()
 * guarantees this always finds a row - no fallback/null-handling needed here.
 */
export async function getSleepSettings(): Promise<SleepSettings> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    `SELECT window_start, window_end FROM sleep_settings WHERE id = 1;`
  );
  return rowToSettings(row);
}

/**
 * Updates the sleep window. Accepts a partial update so callers can change
 * just windowStart or just windowEnd without needing to re-pass the other -
 * whichever field is omitted keeps its current stored value.
 *
 * This only affects detection/reminders going forward - it does not touch
 * any already-logged screen_sessions data, and (per the simplified plan)
 * there's no past-nights table to retroactively recalculate anyway.
 */
export async function updateSleepSettings(
  update: Partial<SleepSettings>
): Promise<SleepSettings> {
  const db = await getDb();
  const current = await getSleepSettings();

  const windowStart = update.windowStart ?? current.windowStart;
  const windowEnd = update.windowEnd ?? current.windowEnd;

  await db.runAsync(
    `UPDATE sleep_settings SET window_start = ?, window_end = ? WHERE id = 1;`,
    [windowStart, windowEnd]
  );

  return { windowStart, windowEnd };
}