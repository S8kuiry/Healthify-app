import { getDb } from '@/db/client';
import { scheduleSleepTracking } from '../../../modules/screen-activity/src';

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
 * guarantees this always finds a row. Throws if row is missing or data is invalid.
 */
export async function getSleepSettings(): Promise<SleepSettings> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    `SELECT window_start, window_end FROM sleep_settings WHERE id = 1;`
  );

  if (!row) {
    throw new Error('Sleep settings seed row not found. Database may not be initialized.');
  }

  if (!row.window_start || !row.window_end) {
    throw new Error('Sleep settings are missing window_start or window_end.');
  }

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
 *
 * Re-schedules sleep-tracking alarms to reflect the new window.
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

  // CRITICAL: force a WAL checkpoint so the UPDATE above is flushed from the -wal
  // file into the main healthapp.db BEFORE we reschedule. scheduleSleepTracking()
  // runs native Kotlin that opens a SEPARATE SQLite connection to read the window.
  // Without this checkpoint, that connection can read the STALE pre-update value
  // (the new frame is still only in this JS connection's WAL), so the alarms get
  // armed for the OLD window - the exact "I changed the time but the reminder
  // didn't move" bug. TRUNCATE fully empties the WAL so any reader sees the value.
  try {
    await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch (err) {
    console.warn('[SleepSettingsRepo] wal_checkpoint failed (continuing):', err);
  }

  // Re-schedule alarms for the new window
  await scheduleSleepTracking().catch((err) =>
    console.warn('[SleepSettingsRepo] Failed to reschedule sleep tracking:', err)
  );

  return { windowStart, windowEnd };
}