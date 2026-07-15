import { getDb } from '@/db/client';
import type { ScreenSession, DailyScreenSummary, DailyScreenPoint } from '@/domain/screenActivity/types';
import { getSleepSettings } from './sleepSettingsRepo';


const RETENTION_DAYS = 8;
const GARBAGE_RETENTION_DAYS = 1;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Resolves the actual bedTime/wakeTime instants for a given date's sleep
 * window - same logic as sleepCalculator.ts's resolveWindowForNight, kept as
 * a small local copy here rather than a cross-file import since it's just a
 * few lines and this file shouldn't need to know about sleep internals.
 */
function resolveWindowForDate(
  dateStr: string,
  windowStart: string,
  windowEnd: string
): { bedTime: Date; wakeTime: Date } {
  const bedTime = new Date(`${dateStr}T${windowStart}:00`);
  const crossesMidnight = toMinutes(windowEnd) <= toMinutes(windowStart);
  const wakeTime = new Date(`${dateStr}T${windowEnd}:00`);
  if (crossesMidnight) wakeTime.setDate(wakeTime.getDate() + 1);
  return { bedTime, wakeTime };
}

function toLocalDateString(isoTimestamp: string): string {
  // Extracts 'YYYY-MM-DD' in local time from an ISO timestamp. Kept as a small
  // helper here rather than pulling in a date library for one operation -
  // matches how dailyActivityRepo.ts's 'YYYY-MM' convention is handled inline.
  const d = new Date(isoTimestamp);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function rowToSession(row: any): ScreenSession {
  return {
    id: row.id,
    date: row.date,
    startTime: row.start_time,
    endTime: row.end_time,
    durationMinutes: row.duration_minutes,
  };
}

function rowToSummary(row: any): DailyScreenSummary {
  return {
    date: row.date,
    totalMinutes: row.total_minutes,
    sessionCount: row.session_count,
    updatedAt: row.updated_at,
  };
}

/**
 * Opens a new session at the given start time. Call this when a SCREEN_ON
 * event arrives with no session currently open. Returns the new session's id.
 */
export async function openSession(startTimeIso: string): Promise<string> {
  const db = await getDb();
  const id = crypto.randomUUID();
  const date = toLocalDateString(startTimeIso);

  await db.runAsync(
    `INSERT INTO screen_sessions (id, date, start_time, end_time, duration_minutes)
     VALUES (?, ?, ?, NULL, NULL);`,
    [id, date, startTimeIso]
  );

  return id;
}

/**
 * Closes the given session at endTimeIso, computes duration, and rolls the
 * result into daily_screen_summary. Call this when a SCREEN_OFF event arrives
 * for the currently-open session.
 *
 * durationMinutes is computed here (not just left to a SQL expression) so the
 * exact same number gets written to both screen_sessions.duration_minutes and
 * folded into daily_screen_summary.total_minutes - keeps the two tables from
 * ever drifting out of sync due to rounding differences.
 */
export async function closeSession(sessionId: string, endTimeIso: string): Promise<void> {
  const db = await getDb();

  const session = await db.getFirstAsync<any>(
    `SELECT * FROM screen_sessions WHERE id = ?;`,
    [sessionId]
  );
  if (!session || session.end_time !== null) {
    // Already closed, or doesn't exist - nothing to do. Guards against a
    // duplicate SCREEN_OFF event closing the same session twice.
    return;
  }

  const startMs = new Date(session.start_time).getTime();
  const endMs = new Date(endTimeIso).getTime();
  const durationMinutes = Math.max(0, Math.round((endMs - startMs) / 60000));

  await db.runAsync(
    `UPDATE screen_sessions SET end_time = ?, duration_minutes = ? WHERE id = ?;`,
    [endTimeIso, durationMinutes, sessionId]
  );

  await db.runAsync(
    `INSERT INTO daily_screen_summary (date, total_minutes, session_count, updated_at)
     VALUES (?, ?, 1, datetime('now'))
     ON CONFLICT(date) DO UPDATE SET
       total_minutes = total_minutes + excluded.total_minutes,
       session_count = session_count + 1,
       updated_at = datetime('now');`,
    [session.date, durationMinutes]
  );
}

/**
 * Returns the currently-open session (end_time IS NULL), if any. Useful on
 * app/service restart to recover in-progress session state rather than
 * assuming none exists.
 */
export async function getOpenSession(): Promise<ScreenSession | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    `SELECT * FROM screen_sessions WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1;`
  );
  return row ? rowToSession(row) : null;
}

/**
 * Returns today's rollup, or null if no sessions have closed yet today.
 */
export async function getSummaryForDate(date: string): Promise<DailyScreenSummary | null> {
  const db = await getDb();
  const row = await db.getFirstAsync<any>(
    `SELECT * FROM daily_screen_summary WHERE date = ?;`,
    [date]
  );
  return row ? rowToSummary(row) : null;
}

/**
 * Returns one point per day in [startDate, endDate] inclusive, defaulting
 * totalMinutes to 0 for days with no summary row (matches DailyScreenPoint's
 * documented "0 for untracked days" contract). startDate/endDate are
 * 'YYYY-MM-DD' strings.
 */
export async function getWeeklyPoints(startDate: string, endDate: string): Promise<DailyScreenPoint[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<any>(
    `SELECT date, total_minutes FROM daily_screen_summary
     WHERE date BETWEEN ? AND ?
     ORDER BY date ASC;`,
    [startDate, endDate]
  );

  const byDate = new Map<string, number>(rows.map((r) => [r.date, r.total_minutes]));

  const points: DailyScreenPoint[] = [];
  const cursor = new Date(startDate);
  const end = new Date(endDate);
  while (cursor <= end) {
    const dateStr = toLocalDateString(cursor.toISOString());
    points.push({ date: dateStr, totalMinutes: byDate.get(dateStr) ?? 0 });
    cursor.setDate(cursor.getDate() + 1);
  }

  return points;
}

/**
 * Cleans up screen_sessions data using two different retention windows:
 *
 *  1. GARBAGE_RETENTION_DAYS (1) - sessions that don't overlap that day's
 *     sleep window at all are deleted the day after they're recorded. This
 *     is daytime noise with no use for sleep detection, so there's no
 *     reason to keep it around even briefly.
 *  2. RETENTION_DAYS (8) - the useful, window-overlapping sessions (and
 *     daily_screen_summary rollups) are kept for a full 8 days before being
 *     deleted outright, regardless of overlap.
 *
 * Safe to call repeatedly (e.g. once per app startup) - every DELETE here is
 * naturally idempotent, nothing errors if there's nothing left to remove.
 */
export async function pruneOldScreenData(): Promise<void> {
  const db = await getDb();
  const settings = await getSleepSettings();

  const today = new Date();

  const garbageCutoff = new Date(today);
  garbageCutoff.setDate(garbageCutoff.getDate() - GARBAGE_RETENTION_DAYS);

  const hardCutoff = new Date(today);
  hardCutoff.setDate(hardCutoff.getDate() - RETENTION_DAYS);
  const hardCutoffDate = toLocalDateString(hardCutoff.toISOString());

  // 1. Hard delete EVERYTHING (including good sleep data) older than 8 days.
  await db.runAsync(`DELETE FROM screen_sessions WHERE date < ?;`, [hardCutoffDate]);
  await db.runAsync(`DELETE FROM daily_screen_summary WHERE date < ?;`, [hardCutoffDate]);

  // 2. For days between the hard cutoff and the garbage cutoff (i.e. day-old
  // or older, but still within the 8-day retention window), delete only the
  // non-overlapping "garbage" sessions - the useful in-window data stays.
  const cursor = new Date(hardCutoff);
  while (cursor < garbageCutoff) {
    const dateStr = toLocalDateString(cursor.toISOString());
    const { bedTime, wakeTime } = resolveWindowForDate(
      dateStr,
      settings.windowStart,
      settings.windowEnd
    );

    await db.runAsync(
      `DELETE FROM screen_sessions
       WHERE date = ?
         AND NOT (start_time < ? AND (end_time IS NULL OR end_time > ?));`,
      [dateStr, wakeTime.toISOString(), bedTime.toISOString()]
    );

    cursor.setDate(cursor.getDate() + 1);
  }
}