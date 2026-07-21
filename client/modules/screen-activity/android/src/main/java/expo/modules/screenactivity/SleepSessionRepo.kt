package expo.modules.screenactivity

import android.database.sqlite.SQLiteDatabase
import android.util.Log
import java.text.SimpleDateFormat
import java.util.*

/**
 * Owns the `sleep_sessions` table - one row per sleep-window OCCURRENCE.
 *
 * The point of this table is that the window's bed/wake instants are resolved
 * ONCE (when ACTION_SLEEP_START fires) and written down. Everything afterwards
 * refers to that stored row by id instead of re-deriving the window from the
 * clock. That is what stops a same-day window (e.g. 10:10 -> 11:33) from having
 * its finalize silently retargeted at the NEXT day's occurrence.
 */
object SleepSessionRepo {
  private const val TAG = "SleepSessionRepo"

  /** Tracking is considered broken if the service stopped checking in for longer than this. */
  private const val HEARTBEAT_STALE_TOLERANCE_MS = 15 * 60 * 1000L

  const val STATUS_TRACKING = "tracking"
  const val STATUS_FINALIZED = "finalized"
  const val STATUS_INCOMPLETE = "incomplete"

  data class SleepSession(
    val id: String,
    val bedTimeMs: Long,
    val wakeTimeMs: Long,
    val status: String,
    val lastHeartbeatMs: Long?
  )

  /**
   * Creates (or reuses) the row for the occurrence ending at [wakeTimeMs]. Reuse
   * keyed on wake_time makes this idempotent: if START fires twice for the same
   * occurrence - a re-arm, a service restart, a BootReceiver replay - we get the
   * same row back rather than a duplicate that would strand the first one in
   * 'tracking' forever.
   */
  fun startSession(db: SQLiteDatabase, bedTimeMs: Long, wakeTimeMs: Long): String {
    val wakeIso = toIso8601(wakeTimeMs)

    db.rawQuery(
      "SELECT id FROM sleep_sessions WHERE wake_time = ? LIMIT 1;",
      arrayOf(wakeIso)
    ).use { c ->
      if (c.moveToFirst()) {
        val existingId = c.getString(0)
        Log.d(TAG, "Reusing existing sleep session $existingId for wake $wakeIso")
        touchHeartbeat(db, existingId)
        return existingId
      }
    }

    val id = UUID.randomUUID().toString()
    db.execSQL(
      """INSERT INTO sleep_sessions (id, bed_time, wake_time, duration_minutes, status, last_heartbeat)
         VALUES (?, ?, ?, NULL, ?, ?);""",
      arrayOf(id, toIso8601(bedTimeMs), wakeIso, STATUS_TRACKING, toIso8601(System.currentTimeMillis()))
    )

    Log.d(TAG, "Started sleep session $id (bed=${toIso8601(bedTimeMs)} wake=$wakeIso)")
    return id
  }

  /** Refreshes the liveness marker. Called periodically while the service runs. */
  fun touchHeartbeat(db: SQLiteDatabase, sessionId: String) {
    try {
      db.execSQL(
        "UPDATE sleep_sessions SET last_heartbeat = ? WHERE id = ? AND status = ?;",
        arrayOf(toIso8601(System.currentTimeMillis()), sessionId, STATUS_TRACKING)
      )
    } catch (e: Exception) {
      Log.w(TAG, "Failed to update heartbeat for $sessionId", e)
    }
  }

  fun findById(db: SQLiteDatabase, sessionId: String): SleepSession? {
    return db.rawQuery(
      "SELECT id, bed_time, wake_time, status, last_heartbeat FROM sleep_sessions WHERE id = ?;",
      arrayOf(sessionId)
    ).use { c -> if (c.moveToFirst()) readRow(c) else null }
  }

  /**
   * Fallback for when STOP arrives without a usable id (e.g. an alarm armed by a
   * previous install). Picks the most recent still-'tracking' occurrence whose
   * wake time has already passed.
   */
  fun findLatestTracking(db: SQLiteDatabase): SleepSession? {
    return db.rawQuery(
      """SELECT id, bed_time, wake_time, status, last_heartbeat FROM sleep_sessions
         WHERE status = ? ORDER BY wake_time DESC LIMIT 1;""",
      arrayOf(STATUS_TRACKING)
    ).use { c -> if (c.moveToFirst()) readRow(c) else null }
  }

  /**
   * Drops occurrences older than [retentionDays]. Without this the table grows
   * without bound - screen_sessions is pruned on every finalize, but these rows
   * were never cleaned up. Retention is deliberately longer than the 8 days kept
   * for raw screen sessions: a sleep_sessions row is a single small summary, and
   * keeping a few weeks of history costs almost nothing while letting the chart
   * show more than a week.
   */
  fun pruneOldSessions(db: SQLiteDatabase, retentionDays: Int = 30) {
    try {
      val cutoffMs = System.currentTimeMillis() - retentionDays * 24L * 60L * 60L * 1000L
      db.execSQL(
        "DELETE FROM sleep_sessions WHERE wake_time < ? AND status != ?;",
        arrayOf(toIso8601(cutoffMs), STATUS_TRACKING)
      )
      Log.d(TAG, "Pruned sleep_sessions older than $retentionDays days")
    } catch (e: Exception) {
      Log.w(TAG, "Failed to prune old sleep sessions", e)
    }
  }

  /** True when an occurrence for this wake instant has already been finalized. */
  fun isAlreadyFinalized(db: SQLiteDatabase, wakeTimeMs: Long): Boolean {
    return db.rawQuery(
      "SELECT 1 FROM sleep_sessions WHERE wake_time = ? AND status != ? LIMIT 1;",
      arrayOf(toIso8601(wakeTimeMs), STATUS_TRACKING)
    ).use { c -> c.moveToFirst() }
  }

  /**
   * Writes the finished result. [durationMinutes] of null marks the occurrence
   * 'incomplete' - the window closed but we can't honestly claim a number.
   */
  fun finalizeSession(db: SQLiteDatabase, sessionId: String, durationMinutes: Int?) {
    val status = if (durationMinutes == null) STATUS_INCOMPLETE else STATUS_FINALIZED
    db.execSQL(
      "UPDATE sleep_sessions SET duration_minutes = ?, status = ? WHERE id = ?;",
      arrayOf(durationMinutes, status, sessionId)
    )
    Log.d(TAG, "Finalized sleep session $sessionId as $status (duration=$durationMinutes)")
  }

  /**
   * Decides whether tracking actually covered the window, used only for the
   * no-sessions case. A window with zero screen sessions is ambiguous: either the
   * user genuinely never touched the phone (great sleep), or the service was
   * killed and we saw nothing. A heartbeat that stayed fresh up to the wake
   * instant distinguishes the first from the second, so we never invent sleep
   * that we did not observe.
   */
  fun trackingCoveredWindow(session: SleepSession): Boolean {
    val heartbeat = session.lastHeartbeatMs ?: return false
    return heartbeat >= session.wakeTimeMs - HEARTBEAT_STALE_TOLERANCE_MS
  }

  private fun readRow(c: android.database.Cursor): SleepSession {
    return SleepSession(
      id = c.getString(0),
      bedTimeMs = parseIso8601(c.getString(1)),
      wakeTimeMs = parseIso8601(c.getString(2)),
      status = c.getString(3),
      lastHeartbeatMs = if (c.isNull(4)) null else parseIso8601(c.getString(4))
    )
  }

  /**
   * Timestamps are stored as 'yyyy-MM-ddTHH:mm:ssZ' in UTC, matching the format
   * ScreenSessionRepo writes for screen_sessions.
   */
  fun toIso8601(timeMs: Long): String {
    val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }
    return sdf.format(Date(timeMs)) + "Z"
  }

  private fun parseIso8601(isoStr: String): Long {
    return try {
      // Take the 'yyyy-MM-ddTHH:mm:ss' core and parse as UTC. Do NOT split on
      // '-': the date itself contains '-' separators.
      SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).apply {
        timeZone = TimeZone.getTimeZone("UTC")
      }.parse(isoStr.take(19))?.time ?: System.currentTimeMillis()
    } catch (e: Exception) {
      Log.e(TAG, "Failed to parse ISO timestamp: $isoStr", e)
      System.currentTimeMillis()
    }
  }
}
