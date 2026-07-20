package expo.modules.screenactivity

import android.util.Log

data class ScreenSessionData(
  val startTime: String,
  val endTime: String?
)

object SleepGapCalculator {
  private const val TAG = "SleepGapCalculator"

  fun computeLargestGapMinutes(
    sessions: List<ScreenSessionData>,
    bedTimeMs: Long,
    wakeTimeMs: Long
  ): Int {
    if (sessions.isEmpty()) {
      val fullDurationMs = wakeTimeMs - bedTimeMs
      val fullDurationMin = (fullDurationMs / 60000).toInt()
      Log.d(TAG, "No sessions found, returning full duration: $fullDurationMin minutes")
      return fullDurationMin
    }

    val sessionTimes = sessions.mapNotNull { session ->
      val startMs = parseIso8601(session.startTime).time
      val endMs = if (session.endTime != null) parseIso8601(session.endTime).time else wakeTimeMs
      if (startMs >= bedTimeMs && startMs < wakeTimeMs) {
        Pair(maxOf(startMs, bedTimeMs), minOf(endMs, wakeTimeMs))
      } else null
    }.sortedBy { it.first }

    if (sessionTimes.isEmpty()) {
      val fullDurationMs = wakeTimeMs - bedTimeMs
      val fullDurationMin = (fullDurationMs / 60000).toInt()
      Log.d(TAG, "No overlapping sessions, returning full duration: $fullDurationMin minutes")
      return fullDurationMin
    }

    var largestGapMs = sessionTimes.first().first - bedTimeMs
    var lastEnd = sessionTimes.first().second

    for (i in 1 until sessionTimes.size) {
      val gap = sessionTimes[i].first - lastEnd
      if (gap > largestGapMs) {
        largestGapMs = gap
      }
      lastEnd = maxOf(lastEnd, sessionTimes[i].second)
    }

    val finalGap = wakeTimeMs - lastEnd
    if (finalGap > largestGapMs) {
      largestGapMs = finalGap
    }

    val largestGapMin = (largestGapMs / 60000).toInt()
    Log.d(TAG, "Computed largest gap: $largestGapMin minutes")
    return largestGapMin
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
