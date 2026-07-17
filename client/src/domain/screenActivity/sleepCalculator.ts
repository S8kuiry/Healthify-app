import { getDb } from '@/db/client';
import { getSleepSettings } from './sleepSettingsRepo';

export interface NightlySleep {
  /** 'YYYY-MM-DD' - the night this result is for */
  nightDate: string;
  /** null means "no data yet" - either the window hasn't finished, or
   *  nothing has been tracked for that night at all */
  durationMinutes: number | null;
}

/**
 * Builds the actual bedTime/wakeTime instants for a given night, based on
 * the current sleep_settings window. Handles the normal case where the
 * window crosses midnight (e.g. 23:00 -> 07:00 next day) as well as a same-
 * day window (e.g. if someone sets an unusual daytime nap window).
 */
function resolveWindowForNight(
  nightDate: string,
  windowStart: string,
  windowEnd: string
): { bedTime: Date; wakeTime: Date } {
  const bedTime = new Date(`${nightDate}T${windowStart}:00`);

  const startMinutes = toMinutes(windowStart);
  const endMinutes = toMinutes(windowEnd);
  const crossesMidnight = endMinutes <= startMinutes;

  const wakeTime = new Date(`${nightDate}T${windowEnd}:00`);
  if (crossesMidnight) {
    wakeTime.setDate(wakeTime.getDate() + 1);
  }

  return { bedTime, wakeTime };
}

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Returns sleep duration for the given night by finding the single largest
 * continuous screen-off gap inside [bedTime, wakeTime]. This is the whole
 * algorithm - no interruption counting, no distraction minutes, no stored
 * result, per the simplified plan.
 *
 * Returns null if no screen session data exists for the night, to distinguish
 * from "no data yet" (window still in progress) vs "no tracking data" (window
 * finished but no sessions recorded).
 */
export async function getSleepForNight(nightDate: string): Promise<NightlySleep> {
  const settings = await getSleepSettings();
  const { bedTime, wakeTime } = resolveWindowForNight(
    nightDate,
    settings.windowStart,
    settings.windowEnd
  );

  // Window hasn't finished yet (e.g. it's currently 2am and wakeTime is 7am
  // today) - nothing to report yet, avoid showing a misleadingly short
  // duration for an in-progress night.
  if (wakeTime.getTime() > Date.now()) {
    return { nightDate, durationMinutes: null };
  }

  const db = await getDb();
  const sessions = await db.getAllAsync<any>(
    `SELECT start_time, end_time FROM screen_sessions
     WHERE start_time < ? AND (end_time IS NULL OR end_time > ?)
     ORDER BY start_time ASC;`,
    [wakeTime.toISOString(), bedTime.toISOString()]
  );

  // No screen sessions recorded for this night - cannot compute sleep.
  // Return null to signal "no data" rather than defaulting to full window.
  if (sessions.length === 0) {
    return { nightDate, durationMinutes: null };
  }

  let largestGapMinutes = 0;
  let cursor = bedTime.getTime();

  for (const session of sessions) {
    if (!session.start_time) {
      console.warn('[sleepCalculator] Skipping session with missing start_time');
      continue;
    }

    try {
      const sessionStart = new Date(session.start_time).getTime();
      // Ongoing session (end_time null) - treat "now" as its end for gap math,
      // clipped to wakeTime below anyway.
      const sessionEnd = session.end_time ? new Date(session.end_time).getTime() : Date.now();

      const gapStart = cursor;
      const gapEnd = Math.min(sessionStart, wakeTime.getTime());
      if (gapEnd > gapStart) {
        largestGapMinutes = Math.max(largestGapMinutes, Math.round((gapEnd - gapStart) / 60000));
      }

      cursor = Math.max(cursor, sessionEnd);
    } catch (err) {
      console.warn('[sleepCalculator] Failed to parse session timestamps:', session, err);
      continue;
    }
  }

  // Final gap from the last session's end (or bedTime, if no sessions at
  // all) through to wakeTime.
  const finalGapEnd = wakeTime.getTime();
  if (finalGapEnd > cursor) {
    largestGapMinutes = Math.max(largestGapMinutes, Math.round((finalGapEnd - cursor) / 60000));
  }

  return { nightDate, durationMinutes: largestGapMinutes };
}

/**
 * Returns one result per night for the last `nights` nights (default 7),
 * most recent last - convenient order for a left-to-right weekly bar chart.
 * endNightDate defaults to yesterday's date if omitted.
 */
export async function getWeeklySleep(
  endNightDate?: string,
  nights: number = 7
): Promise<NightlySleep[]> {
  const end = endNightDate ? new Date(endNightDate) : (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d;
  })();

  const results: NightlySleep[] = [];
  for (let i = nights - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    const nightDate = d.toISOString().slice(0, 10);
    results.push(await getSleepForNight(nightDate));
  }

  return results;
}