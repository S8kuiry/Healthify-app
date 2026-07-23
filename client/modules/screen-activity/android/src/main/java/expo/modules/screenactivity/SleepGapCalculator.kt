package expo.modules.screenactivity

import android.util.Log

data class ScreenSessionData(
  val startTime: String,
  val endTime: String?
)

object SleepGapCalculator {
  private const val TAG = "SleepGapCalculator"

  /**
   * Estimates how long the user slept inside the [bedTimeMs, wakeTimeMs] window
   * as: total window length MINUS the total time the phone screen was on inside
   * that window.
   *
   * Example: window 1:41 -> 8:30 is 6h49m. If the phone was switched on 5 times
   * for ~1 minute each during the night, that is 5 minutes of screen-on time, so
   * the reported sleep is 6h49m - 5m = 6h44m.
   *
   * This replaced an older "single largest uninterrupted gap" measure, which was
   * badly pessimistic: one phone pickup in the middle of the night threw away
   * every hour on the smaller side of it, so 7 hours of sleep with a single 4am
   * clock-check could report as ~4 hours. Subtracting only the actual screen-on
   * minutes matches what a person means by "how long did I sleep".
   *
   * The method name is kept so the existing caller is untouched; despite the
   * name it returns total asleep minutes, not a single gap.
   */
  fun computeLargestGapMinutes(
    sessions: List<ScreenSessionData>,
    bedTimeMs: Long,
    wakeTimeMs: Long
  ): Int {
    val windowMs = wakeTimeMs - bedTimeMs
    if (windowMs <= 0) return 0

    val fullWindowMin = (windowMs / 60000).toInt()

    if (sessions.isEmpty()) {
      Log.d(TAG, "No sessions found, returning full window: $fullWindowMin minutes")
      return fullWindowMin
    }

    // Clip every screen session to the window and keep only the parts that fall
    // inside it. A session that starts before bed or ends after wake still
    // counts for the portion that overlaps the window, and nothing outside it.
    val clipped = sessions.mapNotNull { session ->
      val startMs = parseIso8601(session.startTime).time
      // An open session (still on at wake) counts as on right up to wake time.
      val endMs = if (session.endTime != null) parseIso8601(session.endTime).time else wakeTimeMs
      val s = maxOf(startMs, bedTimeMs)
      val e = minOf(endMs, wakeTimeMs)
      if (e > s) Pair(s, e) else null
    }.sortedBy { it.first }

    if (clipped.isEmpty()) {
      Log.d(TAG, "No overlapping sessions, returning full window: $fullWindowMin minutes")
      return fullWindowMin
    }

    // Merge overlapping / touching screen sessions BEFORE summing, so time the
    // phone was on is never counted twice. Without this, two sessions that
    // overlap (or an open session that spans several closed ones) would subtract
    // more than the real screen-on time and under-report sleep.
    var screenOnMs = 0L
    var curStart = clipped.first().first
    var curEnd = clipped.first().second
    for (i in 1 until clipped.size) {
      val (s, e) = clipped[i]
      if (s <= curEnd) {
        // Overlapping or adjacent - extend the current on-block.
        curEnd = maxOf(curEnd, e)
      } else {
        screenOnMs += curEnd - curStart
        curStart = s
        curEnd = e
      }
    }
    screenOnMs += curEnd - curStart

    val sleepMs = (windowMs - screenOnMs).coerceAtLeast(0)
    val sleepMin = (sleepMs / 60000).toInt()

    Log.d(
      TAG,
      "Window=${fullWindowMin}m screenOn=${screenOnMs / 60000}m -> sleep=$sleepMin minutes"
    )
    return sleepMin
  }

  private fun parseIso8601(isoStr: String): java.util.Date {
    return try {
      // Timestamps are written as 'yyyy-MM-ddTHH:mm:ssZ' in UTC. Take the first
      // 19 chars (the 'yyyy-MM-ddTHH:mm:ss' core) and parse as UTC. Do NOT strip
      // on '-': the date itself contains '-' separators, so substringBefore("-")
      // would collapse the whole timestamp down to just the year.
      val trimmed = isoStr.take(19)
      java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss").apply {
        timeZone = java.util.TimeZone.getTimeZone("UTC")
      }.parse(trimmed)
        ?: java.util.Date(System.currentTimeMillis())
    } catch (e: Exception) {
      Log.e(TAG, "Failed to parse ISO timestamp: $isoStr", e)
      java.util.Date(System.currentTimeMillis())
    }
  }
}
