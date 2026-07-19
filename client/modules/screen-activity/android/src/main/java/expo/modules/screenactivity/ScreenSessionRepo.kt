package expo.modules.screenactivity

import android.database.sqlite.SQLiteDatabase
import android.util.Log
import java.text.SimpleDateFormat
import java.util.*

object ScreenSessionRepo {
  private const val TAG = "ScreenSessionRepo"
  private const val RETENTION_DAYS = 8
  private const val GARBAGE_RETENTION_DAYS = 1
  private const val MAX_RETRIES = 3
  private const val RETRY_DELAY_MS = 100L

  fun openSession(db: SQLiteDatabase, startTimeIso: String): String {
    val id = UUID.randomUUID().toString()
    val date = toLocalDateString(startTimeIso)

    db.execSQL(
      """INSERT INTO screen_sessions (id, date, start_time, end_time, duration_minutes)
         VALUES (?, ?, ?, NULL, NULL);""",
      arrayOf(id, date, startTimeIso)
    )

    Log.d(TAG, "Opened session $id on $date")
    return id
  }

  fun closeSession(db: SQLiteDatabase, sessionId: String, endTimeIso: String): Boolean {
    var cursor = db.rawQuery("SELECT * FROM screen_sessions WHERE id = ?;", arrayOf(sessionId))
    if (!cursor.moveToFirst()) {
      cursor.close()
      Log.d(TAG, "Session $sessionId not found")
      return false
    }

    val endTimeColIdx = cursor.getColumnIndex("end_time")
    if (!cursor.isNull(endTimeColIdx)) {
      cursor.close()
      Log.d(TAG, "Session $sessionId already closed")
      return false
    }

    val startTimeColIdx = cursor.getColumnIndex("start_time")
    val startTimeStr = cursor.getString(startTimeColIdx)
    val dateColIdx = cursor.getColumnIndex("date")
    val date = cursor.getString(dateColIdx)
    cursor.close()

    val startMs = parseIso8601(startTimeStr).time
    val endMs = parseIso8601(endTimeIso).time
    val durationMinutes = Math.max(0, Math.round((endMs - startMs) / 60000.0).toLong()).toInt()

    db.execSQL(
      "UPDATE screen_sessions SET end_time = ?, duration_minutes = ? WHERE id = ?;",
      arrayOf(endTimeIso, durationMinutes, sessionId)
    )

    db.execSQL(
      """INSERT INTO daily_screen_summary (date, total_minutes, session_count, updated_at)
         VALUES (?, ?, 1, datetime('now'))
         ON CONFLICT(date) DO UPDATE SET
           total_minutes = total_minutes + excluded.total_minutes,
           session_count = session_count + 1,
           updated_at = datetime('now');""",
      arrayOf(date, durationMinutes)
    )

    Log.d(TAG, "Closed session $sessionId with duration $durationMinutes minutes")
    return true
  }

  fun getOpenSession(db: SQLiteDatabase): String? {
    val cursor = db.rawQuery(
      "SELECT * FROM screen_sessions WHERE end_time IS NULL ORDER BY start_time DESC LIMIT 1;",
      null
    )
    val sessionId = if (cursor.moveToFirst()) {
      cursor.getString(cursor.getColumnIndex("id"))
    } else null
    cursor.close()

    return sessionId?.also { Log.d(TAG, "Found open session: $it") }
  }

  fun pruneOldScreenData(db: SQLiteDatabase, windowStart: String, windowEnd: String) {
    try {
      db.beginTransaction()

      val today = Calendar.getInstance()
      val todayStr = toLocalDateString(today.timeInMillis)

      // Clean up orphaned sessions (still open from a previous run)
      val orphanedId = getOpenSession(db)
      if (orphanedId != null) {
        val now = Date(System.currentTimeMillis())
        closeSession(db, orphanedId, now.toIso8601())
      }

      val garbageCutoff = Calendar.getInstance().apply {
        add(Calendar.DAY_OF_MONTH, -GARBAGE_RETENTION_DAYS)
      }
      val garbageCutoffStr = toLocalDateString(garbageCutoff.timeInMillis)

      val hardCutoff = Calendar.getInstance().apply {
        add(Calendar.DAY_OF_MONTH, -RETENTION_DAYS)
      }
      val hardCutoffStr = toLocalDateString(hardCutoff.timeInMillis)

      // 1. Hard delete EVERYTHING older than 8 days.
      db.execSQL("DELETE FROM screen_sessions WHERE date < ?;", arrayOf(hardCutoffStr))
      db.execSQL("DELETE FROM daily_screen_summary WHERE date < ?;", arrayOf(hardCutoffStr))

      // 2. For days between hard and garbage cutoff, delete only non-overlapping sessions.
      val cursor = Calendar.getInstance().apply { timeInMillis = hardCutoff.timeInMillis }
      while (cursor.timeInMillis < garbageCutoff.timeInMillis) {
        val dateStr = toLocalDateString(cursor.timeInMillis)
        val (bedTime, wakeTime) = resolveWindowForDate(dateStr, windowStart, windowEnd)

        db.execSQL(
          """DELETE FROM screen_sessions
             WHERE date = ?
               AND NOT (start_time < ? AND (end_time IS NULL OR end_time > ?));""",
          arrayOf(dateStr, wakeTime.toIso8601(), bedTime.toIso8601())
        )

        cursor.add(Calendar.DAY_OF_MONTH, 1)
      }

      db.setTransactionSuccessful()
      Log.d(TAG, "Pruned old screen data successfully")
    } finally {
      db.endTransaction()
    }
  }

  private fun toLocalDateString(timeMs: Long): String {
    val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
    sdf.timeZone = TimeZone.getDefault()
    return sdf.format(Date(timeMs))
  }

  private fun toLocalDateString(isoTimestamp: String): String {
    val date = parseIso8601(isoTimestamp)
    return toLocalDateString(date.time)
  }

  private fun toMinutes(hhmm: String): Int {
    val parts = hhmm.split(":")
    val h = parts.getOrNull(0)?.toIntOrNull() ?: 0
    val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
    return h * 60 + m
  }

  private fun resolveWindowForDate(
    dateStr: String,
    windowStart: String,
    windowEnd: String
  ): Pair<Date, Date> {
    val bedTime = Calendar.getInstance().apply {
      timeZone = TimeZone.getDefault()
      val parts = dateStr.split("-")
      val year = parts[0].toInt()
      val month = parts[1].toInt() - 1
      val day = parts[2].toInt()
      val startMin = toMinutes(windowStart)

      set(year, month, day, startMin / 60, startMin % 60, 0)
    }.time

    val crossesMidnight = toMinutes(windowEnd) <= toMinutes(windowStart)
    val wakeTime = Calendar.getInstance().apply {
      timeZone = TimeZone.getDefault()
      val parts = dateStr.split("-")
      val year = parts[0].toInt()
      val month = parts[1].toInt() - 1
      val day = parts[2].toInt()
      val endMin = toMinutes(windowEnd)

      set(year, month, day, endMin / 60, endMin % 60, 0)
      if (crossesMidnight) {
        add(Calendar.DAY_OF_MONTH, 1)
      }
    }.time

    return Pair(bedTime, wakeTime)
  }

  private fun parseIso8601(isoStr: String): Date {
    return try {
      val basePart = isoStr.substringBefore("Z").substringBefore("+")
      java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss").apply {
        timeZone = TimeZone.getTimeZone("UTC")
      }.parse(basePart) ?: Date(System.currentTimeMillis())
    } catch (e: Exception) {
      Date(System.currentTimeMillis())
    }
  }

  private fun Date.toIso8601(): String {
    val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss").apply {
      timeZone = TimeZone.getTimeZone("UTC")
    }
    return sdf.format(this) + "Z"
  }

  /**
   * Close session with automatic retry on database lock. Handles concurrent access
   * from the step tracker or other services accessing the same database.
   */
  fun closeSessionWithRetry(db: SQLiteDatabase, sessionId: String, endTimeIso: String) {
    var lastError: Exception? = null
    for (attempt in 1..MAX_RETRIES) {
      try {
        closeSession(db, sessionId, endTimeIso)
        Log.d(TAG, "Successfully closed session $sessionId on attempt $attempt")
        return
      } catch (e: Exception) {
        lastError = e
        if (attempt < MAX_RETRIES) {
          Log.w(TAG, "Failed to close session (attempt $attempt/$MAX_RETRIES), retrying...", e)
          Thread.sleep(RETRY_DELAY_MS)
        }
      }
    }
    throw lastError ?: Exception("Failed to close session after $MAX_RETRIES attempts")
  }

  /**
   * Prune old screen data with automatic retry on database lock. Ensures data cleanup
   * completes even under concurrent database access.
   */
  fun pruneOldScreenDataWithRetry(db: SQLiteDatabase, windowStart: String, windowEnd: String) {
    var lastError: Exception? = null
    for (attempt in 1..MAX_RETRIES) {
      try {
        pruneOldScreenData(db, windowStart, windowEnd)
        Log.d(TAG, "Successfully pruned old screen data on attempt $attempt")
        return
      } catch (e: Exception) {
        lastError = e
        if (attempt < MAX_RETRIES) {
          Log.w(TAG, "Failed to prune data (attempt $attempt/$MAX_RETRIES), retrying...", e)
          Thread.sleep(RETRY_DELAY_MS)
        }
      }
    }
    throw lastError ?: Exception("Failed to prune data after $MAX_RETRIES attempts")
  }
}
