package expo.modules.screenactivity

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.os.Build
import android.os.IBinder
import android.util.Log
import java.io.File
import java.util.*

/**
 * Foreground service whose only job is to stay alive long enough to keep
 * ScreenEventReceiver's dynamic registration active. Without this, Android would tear the
 * registration down as soon as the app is backgrounded, and screen on/off events overnight
 * (e.g. for sleep detection) would simply stop arriving.
 *
 * Mirrors StepTrackerService's role in the step-tracker feature - same "must stay alive"
 * constraint, same foreground-service solution.
 */
class ScreenActivityService : Service() {

  private var receiver: ScreenEventReceiver? = null
  private var openSessionId: String? = null

  companion object {
    private const val TAG = "ScreenActivityService"
    private const val CHANNEL_ID = "screen_activity_tracking"
    private const val NOTIFICATION_ID = 9101 // Arbitrary but must be unique app-wide

    fun start(context: Context) {
      val intent = Intent(context, ScreenActivityService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, ScreenActivityService::class.java))
    }
  }

  override fun onCreate() {
    super.onCreate()
    startForeground(NOTIFICATION_ID, buildNotification())
    registerScreenReceiver()
    registerNativeListener()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      "ACTION_FINALIZE_AND_STOP" -> {
        Log.d(TAG, "Received ACTION_FINALIZE_AND_STOP")
        finalizeAndStop()
        return START_NOT_STICKY
      }
    }
    // START_STICKY: if the system kills this service under memory pressure, it will attempt
    // to recreate it later (without redelivering the last intent). Appropriate here since this
    // service has no per-command state - onCreate alone is enough to restore full function.
    return START_STICKY
  }

  override fun onDestroy() {
    unregisterNativeListener()
    unregisterScreenReceiver()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun registerScreenReceiver() {
    if (receiver != null) return // Already registered - avoid double registration
    val r = ScreenEventReceiver()
    registerReceiver(r, ScreenEventReceiver.intentFilter())
    receiver = r
  }

  private fun unregisterScreenReceiver() {
    receiver?.let {
      try {
        unregisterReceiver(it)
      } catch (e: IllegalArgumentException) {
        // Receiver was already unregistered (e.g. onDestroy called twice) - safe to ignore.
      }
    }
    receiver = null
  }

  private fun getCurrentTimeIso8601(): String {
    val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
    sdf.timeZone = TimeZone.getTimeZone("UTC")
    return sdf.format(Date(System.currentTimeMillis())) + "Z"
  }

  private fun dateToIso8601(date: Date): String {
    val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
    sdf.timeZone = TimeZone.getTimeZone("UTC")
    return sdf.format(date) + "Z"
  }

  private fun registerNativeListener() {
    ScreenActivityEventDispatcher.addListener { event ->
      when (event.type) {
        "SCREEN_ON" -> {
          if (openSessionId == null) {
            var db: SQLiteDatabase? = null
            try {
              db = openDatabase()
              if (db != null) {
                db.beginTransaction()
                openSessionId = ScreenSessionRepo.openSession(db, getCurrentTimeIso8601())
                db.setTransactionSuccessful()
                Log.d(TAG, "Opened session: $openSessionId")
              }
            } catch (e: Exception) {
              Log.e(TAG, "Error opening session", e)
            } finally {
              db?.apply {
                endTransaction()
                close()
              }
            }
          }
        }
        "SCREEN_OFF" -> {
          if (openSessionId != null) {
            var db: SQLiteDatabase? = null
            try {
              db = openDatabase()
              if (db != null) {
                db.beginTransaction()
                ScreenSessionRepo.closeSession(db, openSessionId!!, getCurrentTimeIso8601())
                db.setTransactionSuccessful()
                Log.d(TAG, "Closed session: $openSessionId")
                openSessionId = null
              }
            } catch (e: Exception) {
              Log.e(TAG, "Error closing session", e)
            } finally {
              db?.apply {
                endTransaction()
                close()
              }
            }
          }
        }
      }
    }
  }

  private fun unregisterNativeListener() {
    // Note: we don't have direct removal yet, this is for symmetry
    // The dispatcher will clean up on service destroy
  }

  private fun finalizeAndStop() {
    var db: SQLiteDatabase? = null
    try {
      db = openDatabase()
      if (db != null) {
        // Close any open session with retries to handle database locks
        if (openSessionId != null) {
          try {
            ScreenSessionRepo.closeSessionWithRetry(db, openSessionId!!, getCurrentTimeIso8601())
            openSessionId = null
          } catch (e: Exception) {
            Log.e(TAG, "Failed to close session after retries", e)
            openSessionId = null
          }
        }

        // Query all sessions in the window that just ended.
        val settings = readSleepSettings(db) ?: return stopSelf()
        val (windowStartMin, windowEndMin) = settings

        // Anchor the window to the night that just ended at "now". wakeTime is
        // the most recent occurrence of windowEnd at or before now; bedTime is
        // one window-length earlier. This correctly places bedTime on the
        // PREVIOUS calendar day for a window that crosses midnight (e.g.
        // 23:00 -> 07:00), which the old "today at HH:mm" anchoring got wrong -
        // it pointed bedTime at tonight instead of last night, so the query
        // matched none of the sessions actually recorded overnight.
        val (bedTime, wakeTime) = resolveEndedWindow(windowStartMin, windowEndMin)

        // Filter purely by the timestamp range (start before wake, still open
        // or ending after bed). The old query also constrained `date = today`,
        // but `date` is the LOCAL date of a session's start_time, so pre-midnight
        // sessions carry yesterday's date and were being excluded entirely. The
        // range test alone is correct and matches the JS getSleepForNight query.
        val cursor = db.rawQuery(
          "SELECT start_time, end_time FROM screen_sessions WHERE start_time < ? AND (end_time IS NULL OR end_time > ?) ORDER BY start_time ASC;",
          arrayOf(dateToIso8601(wakeTime), dateToIso8601(bedTime))
        )

        val sessions = mutableListOf<ScreenSessionData>()
        while (cursor.moveToNext()) {
          sessions.add(
            ScreenSessionData(
              cursor.getString(0),
              cursor.getString(1)
            )
          )
        }
        cursor.close()

        // Compute sleep duration
        val durationMinutes = SleepGapCalculator.computeLargestGapMinutes(
          sessions,
          bedTime.time,
          wakeTime.time
        )

        // Run pruning with retry logic
        try {
          val windowStartStr = String.format("%02d:%02d", windowStartMin / 60, windowStartMin % 60)
          val windowEndStr = String.format("%02d:%02d", windowEndMin / 60, windowEndMin % 60)
          ScreenSessionRepo.pruneOldScreenDataWithRetry(db, windowStartStr, windowEndStr)
        } catch (e: Exception) {
          Log.w(TAG, "Pruning failed, continuing anyway", e)
        }

        // Post summary notification
        SleepSummaryNotifier.postSleepSummary(this, durationMinutes)

        Log.d(TAG, "Finalized sleep tracking: $durationMinutes minutes")
      }
    } catch (e: Exception) {
      Log.e(TAG, "Error during finalize", e)
    } finally {
      db?.apply {
        try {
          close()
        } catch (e: Exception) {
          Log.w(TAG, "Error closing database", e)
        }
      }
      unregisterNativeListener()
      unregisterScreenReceiver()
      stopSelf()
    }
  }


  private fun openDatabase(): SQLiteDatabase? {
    return try {
      val dbFile = File(filesDir, "SQLite/healthapp.db")
      if (!dbFile.exists()) {
        Log.w(TAG, "Database file not found")
        return null
      }
      val db = SQLiteDatabase.openDatabase(dbFile.absolutePath, null, SQLiteDatabase.OPEN_READWRITE)
      // Ensure WAL mode is enabled for concurrent access from step tracker and other services
      db.enableWriteAheadLogging()
      Log.d(TAG, "Database opened with WAL mode enabled")
      db
    } catch (e: Exception) {
      Log.e(TAG, "Failed to open database", e)
      null
    }
  }

  private fun readSleepSettings(db: SQLiteDatabase): Pair<Int, Int>? {
    return try {
      db.rawQuery("SELECT window_start, window_end FROM sleep_settings WHERE id = 1;", null).use { c ->
        if (c.moveToFirst() && !c.isNull(0) && !c.isNull(1)) {
          val windowStart = c.getString(0)
          val windowEnd = c.getString(1)
          val startMin = timeToMinutes(windowStart)
          val endMin = timeToMinutes(windowEnd)
          Pair(startMin, endMin)
        } else null
      }
    } catch (e: Exception) {
      Log.w(TAG, "Could not read sleep settings", e)
      null
    }
  }

  private fun timeToMinutes(hhmm: String): Int {
    val parts = hhmm.split(":")
    val h = parts.getOrNull(0)?.toIntOrNull() ?: 0
    val m = parts.getOrNull(1)?.toIntOrNull() ?: 0
    return h * 60 + m
  }

  /**
   * Resolves the [bedTime, wakeTime] instants for the sleep window that just
   * ended at "now" - the ACTUAL night being finalized. wakeTime is the most
   * recent occurrence of windowEnd at or before now; bedTime is one full
   * window length earlier. This keeps bedTime on the correct calendar day even
   * when the window crosses midnight, so the session query below actually spans
   * the overnight sessions instead of an empty future range.
   */
  private fun resolveEndedWindow(windowStartMin: Int, windowEndMin: Int): Pair<Date, Date> {
    // Window length in minutes, handling the midnight-crossing case where
    // windowEnd is numerically <= windowStart (e.g. 23:00 -> 07:00 = 480 min).
    val rawLength = windowEndMin - windowStartMin
    val windowLengthMin = if (rawLength > 0) rawLength else rawLength + 24 * 60

    // Most recent wake instant at or before now.
    val wakeCal = Calendar.getInstance().apply {
      set(Calendar.HOUR_OF_DAY, windowEndMin / 60)
      set(Calendar.MINUTE, windowEndMin % 60)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
      // If that puts wake in the future (window hasn't ended today yet), step
      // back a day so we finalize the window that genuinely just closed.
      if (after(Calendar.getInstance())) {
        add(Calendar.DAY_OF_MONTH, -1)
      }
    }

    val bedCal = Calendar.getInstance().apply {
      timeInMillis = wakeCal.timeInMillis
      add(Calendar.MINUTE, -windowLengthMin)
    }

    return Pair(bedCal.time, wakeCal.time)
  }

  private fun resolveWindowForDate(
    dateStr: String,
    windowStartMin: Int,
    windowEndMin: Int
  ): Pair<Date, Date> {
    val parts = dateStr.split("-")
    val year = parts[0].toInt()
    val month = parts[1].toInt() - 1
    val day = parts[2].toInt()

    val bedTime = Calendar.getInstance().apply {
      set(year, month, day, windowStartMin / 60, windowStartMin % 60, 0)
    }.time

    val wakeTime = Calendar.getInstance().apply {
      set(year, month, day, windowEndMin / 60, windowEndMin % 60, 0)
      if (windowEndMin <= windowStartMin) {
        add(Calendar.DAY_OF_MONTH, 1)
      }
    }.time

    return Pair(bedTime, wakeTime)
  }

  private fun Calendar.toLocalDateString(): String {
    val year = get(Calendar.YEAR)
    val month = String.format("%02d", get(Calendar.MONTH) + 1)
    val day = String.format("%02d", get(Calendar.DAY_OF_MONTH))
    return "$year-$month-$day"
  }

  private fun Long.toIso8601(): String {
    val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US)
    sdf.timeZone = TimeZone.getTimeZone("UTC")
    return sdf.format(Date(this)) + "Z"
  }

  private fun buildNotification(): Notification {
    val channelId = ensureNotificationChannel()

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, channelId)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    return builder
      .setContentTitle("HealthApp")
      .setContentText("Your screen activity is being tracked for sleep analysis.")
      .setSmallIcon(applicationInfo.icon)
      .setOngoing(true)
      .build()
  }

  private fun ensureNotificationChannel(): String {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val existing = manager.getNotificationChannel(CHANNEL_ID)
      if (existing == null) {
        val channel = NotificationChannel(
          CHANNEL_ID,
          "Screen Activity Tracking",
          NotificationManager.IMPORTANCE_MIN // Silent, low-visibility - this is a background tracker, not a user-facing alert
        )
        manager.createNotificationChannel(channel)
      }
    }
    return CHANNEL_ID
  }
}