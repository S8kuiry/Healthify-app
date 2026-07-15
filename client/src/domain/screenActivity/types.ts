/**
 * A single continuous "phone was actively on" session, as stored in the
 * screen_sessions table. Written incrementally: a row is inserted with
 * endTime = null when a session starts, then updated with endTime +
 * durationMinutes once it closes (see screenActivityRepo.ts, next phase).
 */
export interface ScreenSession {
  id: string;
  /** 'YYYY-MM-DD', local date of startTime — NOT endTime, so a session
   *  crossing midnight is attributed to the day it started on. */
  date: string;
  /** ISO timestamp */
  startTime: string;
  /** ISO timestamp; null while the session is still ongoing */
  endTime: string | null;
  /** null until endTime is set */
  durationMinutes: number | null;
}

/**
 * Precomputed per-day rollup, as stored in daily_screen_summary. Updated
 * incrementally whenever a session closes rather than recalculated from
 * screen_sessions on every read.
 */
export interface DailyScreenSummary {
  /** 'YYYY-MM-DD' */
  date: string;
  totalMinutes: number;
  sessionCount: number;
  /** ISO timestamp of the last write to this row */
  updatedAt: string;
}

/**
 * Shape used by the weekly graph view — one entry per day in the displayed
 * range, with totalMinutes defaulting to 0 for days with no summary row yet
 * (e.g. before the user installed the app, or a day tracking was off).
 */
export interface DailyScreenPoint {
  date: string;
  totalMinutes: number;
}