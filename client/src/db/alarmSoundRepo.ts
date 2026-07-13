import { getDb } from './client';

/**
 * Global alarm tone + volume settings. Each lives in its own single-row table
 * (`reminder_sound`, `reminder_volume`, id = 1). These same tables are read
 * directly by the Kotlin AlarmService (see AlarmService.kt) when an alarm
 * fires — keep the shapes in sync.
 */

export const DEFAULT_ALARM_VOLUME = 100;

/** The currently selected alarm tone URI, or null if none set (use default). */
export async function getSelectedAlarmUri(): Promise<string | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ sound_uri: string | null }>(
    'SELECT sound_uri FROM reminder_sound WHERE id = 1;'
  );
  return row?.sound_uri ?? null;
}

/** Persist the user's chosen alarm tone URI so it's used by the next reminder. */
export async function setSelectedAlarmUri(uri: string): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO reminder_sound (id, sound_uri) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET sound_uri = excluded.sound_uri;`,
    [uri]
  );
  // Kotlin's AlarmService opens the DB read-only from a separate connection and
  // may not see writes still sitting in the WAL. Checkpoint so the value lands
  // in the main .db file and is visible at alarm time.
  await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
}

/** Whether alarms vibrate. Defaults to true (on) if unset. */
export async function getVibrateEnabled(): Promise<boolean> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ vibrate: number }>(
    'SELECT vibrate FROM reminder_sound WHERE id = 1;'
  );
  // Default ON: only explicitly-stored 0 disables vibration.
  return row?.vibrate !== 0;
}

/** Persist whether alarms vibrate. */
export async function setVibrateEnabled(enabled: boolean): Promise<void> {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO reminder_sound (id, vibrate) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET vibrate = excluded.vibrate;`,
    [enabled ? 1 : 0]
  );
  // See note in setSelectedAlarmUri: checkpoint so Kotlin's read-only
  // connection sees the new value at alarm time.
  await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
}

/** The alarm volume (0–100). Defaults to full if unset. */
export async function getAlarmVolume(): Promise<number> {
  const db = await getDb();
  const row = await db.getFirstAsync<{ volume: number }>(
    'SELECT volume FROM reminder_volume WHERE id = 1;'
  );
  return row?.volume ?? DEFAULT_ALARM_VOLUME;
}

/** Persist the alarm volume (0–100). */
export async function setAlarmVolume(volume: number): Promise<void> {
  const clamped = Math.max(0, Math.min(100, Math.round(volume)));
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO reminder_volume (id, volume) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET volume = excluded.volume;`,
    [clamped]
  );
  // See note in setSelectedAlarmUri: checkpoint so Kotlin's read-only
  // connection sees the new value at alarm time.
  await db.execAsync('PRAGMA wal_checkpoint(TRUNCATE);');
}
