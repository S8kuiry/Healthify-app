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

  /** The sleep_sessions row for the window currently being tracked, if any. */
  private var activeSleepSessionId: String? = null

  /**
   * Periodic liveness marker for the active sleep occurrence. A window that ends
   * with zero screen sessions is ambiguous - perfect sleep, or a service the OEM
   * killed hours ago. The heartbeat is what lets finalize tell those apart, so we
   * report "tracking was interrupted" instead of inventing a full night's sleep.
   */
  private val heartbeatHandler = android.os.Handler(android.os.Looper.getMainLooper())
  private val heartbeatRunnable = object : Runnable {
    override fun run() {
      recordHeartbeat()
      heartbeatHandler.postDelayed(this, HEARTBEAT_INTERVAL_MS)
    }
  }

  companion object {
    private const val TAG = "ScreenActivityService"
    private const val CHANNEL_ID = "screen_activity_tracking"
    private const val NOTIFICATION_ID = 9101 // Arbitrary but must be unique app-wide

    /**
     * How often the active sleep occurrence's liveness marker is refreshed. Five
     * minutes is well inside SleepSessionRepo's 15-minute staleness tolerance, so
     * a couple of missed ticks (Doze, brief CPU starvation) won't be mistaken for
     * the service having been killed.
     */
    private const val HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000L

    const val ACTION_BEGIN_WINDOW = "ACTION_BEGIN_WINDOW"

    fun start(context: Context) {
      val intent = Intent(context, ScreenActivityService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    /**
     * Starts the service for a specific sleep-window occurrence, recording it in
     * `sleep_sessions` so STOP can later finalize that exact row.
     */
    fun startForWindow(context: Context, bedTimeMs: Long, wakeTimeMs: Long) {
      val intent = Intent(context, ScreenActivityService::class.java).apply {
        action = ACTION_BEGIN_WINDOW
        putExtra(SleepTrackingAlarmScheduler.EXTRA_BED_TIME_MS, bedTimeMs)
        putExtra(SleepTrackingAlarmScheduler.EXTRA_WAKE_TIME_MS, wakeTimeMs)
      }
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
    resumeActiveWindow()
  }

  /**
   * Re-attaches to an in-progress sleep occurrence after the service is recreated
   * (START_STICKY restart, or a plain start() while a window is running). Without
   * this the heartbeat would stay dead for the rest of the window and finalize
   * would wrongly conclude tracking never covered it.
   */
  private fun resumeActiveWindow() {
    if (activeSleepSessionId != null) return

    var db: SQLiteDatabase? = null
    try {
      db = openDatabase() ?: return
      val session = SleepSessionRepo.findLatestTracking(db) ?: return
      // Only adopt a window that is genuinely still in progress.
      if (System.currentTimeMillis() >= session.wakeTimeMs) return

      activeSleepSessionId = session.id
      Log.d(TAG, "Resumed in-progress sleep occurrence ${session.id}")
      startHeartbeat()
    } catch (e: Exception) {
      Log.w(TAG, "Failed to resume active sleep window", e)
    } finally {
      db?.apply {
        try {
          close()
        } catch (e: Exception) {
          Log.w(TAG, "Error closing database", e)
        }
      }
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_BEGIN_WINDOW -> {
        val bedTimeMs = intent.getLongExtra(SleepTrackingAlarmScheduler.EXTRA_BED_TIME_MS, 0L)
        val wakeTimeMs = intent.getLongExtra(SleepTrackingAlarmScheduler.EXTRA_WAKE_TIME_MS, 0L)
        Log.d(TAG, "Received ACTION_BEGIN_WINDOW (bed=$bedTimeMs wake=$wakeTimeMs)")
        beginWindow(bedTimeMs, wakeTimeMs)
        return START_STICKY
      }
      "ACTION_FINALIZE_AND_STOP" -> {
        Log.d(TAG, "Received ACTION_FINALIZE_AND_STOP")
        val wakeTimeMs = intent.getLongExtra(SleepTrackingAlarmScheduler.EXTRA_WAKE_TIME_MS, 0L)
        finalizeAndStop(wakeTimeMs)
        return START_NOT_STICKY
      }
    }
    // START_STICKY: if the system kills this service under memory pressure, it will attempt
    // to recreate it later (without redelivering the last intent). Appropriate here since this
    // service has no per-command state - onCreate alone is enough to restore full function.
    return START_STICKY
  }

  override fun onDestroy() {
    stopHeartbeat()
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

  /**
   * Records the sleep-window occurrence this service was started for, so the
   * later STOP can finalize that exact row. Idempotent - a repeated START for
   * the same occurrence reuses the existing row.
   */
  private fun beginWindow(bedTimeMs: Long, wakeTimeMs: Long) {
    if (bedTimeMs <= 0L || wakeTimeMs <= 0L) {
      Log.w(TAG, "beginWindow called without valid window instants; tracking only")
      return
    }

    var db: SQLiteDatabase? = null
    try {
      db = openDatabase() ?: return
      activeSleepSessionId = SleepSessionRepo.startSession(db, bedTimeMs, wakeTimeMs)
      Log.d(TAG, "Began sleep window, session=$activeSleepSessionId")
      startHeartbeat()
    } catch (e: Exception) {
      Log.e(TAG, "Failed to begin sleep window", e)
    } finally {
      db?.apply {
        try {
          close()
        } catch (e: Exception) {
          Log.w(TAG, "Error closing database", e)
        }
      }
    }
  }

  private fun startHeartbeat() {
    heartbeatHandler.removeCallbacks(heartbeatRunnable)
    heartbeatHandler.post(heartbeatRunnable)
  }

  private fun stopHeartbeat() {
    heartbeatHandler.removeCallbacks(heartbeatRunnable)
  }

  /** Marks the active sleep occurrence as still being watched. */
  private fun recordHeartbeat() {
    val sessionId = activeSleepSessionId ?: return
    var db: SQLiteDatabase? = null
    try {
      db = openDatabase() ?: return
      SleepSessionRepo.touchHeartbeat(db, sessionId)
    } catch (e: Exception) {
      Log.w(TAG, "Failed to record heartbeat", e)
    } finally {
      db?.apply {
        try {
          close()
        } catch (e: Exception) {
          Log.w(TAG, "Error closing database", e)
        }
      }
    }
  }

  /**
   * Finalizes the sleep-window occurrence identified by [intentWakeTimeMs] (the
   * wake instant the STOP alarm was armed for). Finalizing the STORED occurrence
   * - rather than a window re-derived from the clock - is what makes a same-day
   * window (e.g. 10:10 -> 11:33) finalize correctly instead of being matched
   * against the next day's occurrence.
   */
  private fun finalizeAndStop(intentWakeTimeMs: Long = 0L) {
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

        // Resolve the occurrence to finalize: prefer the row this service is
        // actively tracking, then the row matching the STOP alarm's wake
        // instant, and only then fall back to the latest still-tracking row
        // (covers an alarm armed by a previous install).
        val session = activeSleepSessionId?.let { SleepSessionRepo.findById(db, it) }
          ?: SleepSessionRepo.findLatestTracking(db)

        if (session == null) {
          Log.w(TAG, "No tracked sleep occurrence to finalize; skipping summary")
          return stopSelf()
        }

        if (session.status != SleepSessionRepo.STATUS_TRACKING) {
          Log.d(TAG, "Sleep occurrence ${session.id} already finalized; skipping duplicate")
          return stopSelf()
        }

        val bedTime = Date(session.bedTimeMs)
        val wakeTime = Date(session.wakeTimeMs)

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

        // Compute sleep duration.
        //
        // A window with NO screen sessions is ambiguous: either the user never
        // touched the phone (genuinely undisturbed sleep) or tracking was dead
        // the whole time (OEM battery killer, device powered off) and we simply
        // saw nothing. Only the heartbeat can tell those apart, so we claim the
        // full window solely when tracking was alive through it - otherwise the
        // occurrence is marked 'incomplete' and we never invent sleep we did
        // not observe.
        val durationMinutes: Int? = if (sessions.isEmpty()) {
          if (SleepSessionRepo.trackingCoveredWindow(session)) {
            ((wakeTime.time - bedTime.time) / 60000).toInt()
          } else {
            Log.w(TAG, "No sessions and stale heartbeat; marking occurrence incomplete")
            null
          }
        } else {
          SleepGapCalculator.computeLargestGapMinutes(sessions, bedTime.time, wakeTime.time)
        }

        SleepSessionRepo.finalizeSession(db, session.id, durationMinutes)
        activeSleepSessionId = null

        // Run pruning with retry logic
        try {
          val settings = readSleepSettings(db)
          if (settings != null) {
            val (windowStartMin, windowEndMin) = settings
            val windowStartStr = String.format("%02d:%02d", windowStartMin / 60, windowStartMin % 60)
            val windowEndStr = String.format("%02d:%02d", windowEndMin / 60, windowEndMin % 60)
            ScreenSessionRepo.pruneOldScreenDataWithRetry(db, windowStartStr, windowEndStr)
          }
          // Keep the occurrence table bounded too - it would otherwise grow
          // forever, since only raw screen_sessions were ever pruned.
          SleepSessionRepo.pruneOldSessions(db)
        } catch (e: Exception) {
          Log.w(TAG, "Pruning failed, continuing anyway", e)
        }

        // Post summary notification only when we have a duration to report.
        // An incomplete occurrence gets no "here's your sleep" notification,
        // since there is nothing honest to put in it.
        if (durationMinutes != null) {
          SleepSummaryNotifier.postSleepSummary(this, durationMinutes)
          Log.d(TAG, "Finalized sleep tracking: $durationMinutes minutes")
        } else {
          Log.d(TAG, "Finalized sleep tracking as incomplete; no summary posted")
        }
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
      // WAL stays on - it is a persistent property of the file, set by the JS
      // migrations - but this connection must not try to OWN it. See SafeDb:
      // enableWriteAheadLogging() from Android's framework SQLite on a file
      // journalled by expo-sqlite's bundled libsql engine corrupts it.
      val db = SafeDb.openAt(dbFile)
      Log.d(TAG, "Database opened (using existing WAL)")
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