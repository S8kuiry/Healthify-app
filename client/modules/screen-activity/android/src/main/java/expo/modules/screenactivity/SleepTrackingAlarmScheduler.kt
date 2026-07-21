package expo.modules.screenactivity

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.os.Build
import android.provider.Settings
import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.*

object SleepTrackingAlarmScheduler {
  private const val TAG = "SleepTrackingAlarmScheduler"
  private const val FLAGS = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

  // Request codes for the four alarms (use fixed integers that won't collide with reminder-alarm)
  private const val EARLY_REMINDER_REQUEST_CODE = 9201
  private const val FINAL_REMINDER_REQUEST_CODE = 9202
  private const val START_REQUEST_CODE = 9203
  private const val STOP_REQUEST_CODE = 9204

  private const val EARLY_REMINDER_OFFSET_MIN = 60  // 1 hour before
  private const val FINAL_REMINDER_OFFSET_MIN = 10  // 10 minutes before
  private const val STOP_GRACE_MIN = 6              // 6 minutes after window end

  // The concrete window instants an alarm belongs to, carried on the START/STOP
  // intents. The receiver hands them to the service so it finalizes the exact
  // occurrence that was tracked instead of re-deriving one from the clock.
  const val EXTRA_BED_TIME_MS = "extra_bed_time_ms"
  const val EXTRA_WAKE_TIME_MS = "extra_wake_time_ms"

  // Keeps each alarm's "show" PendingIntent in its own request-code space, so it
  // can never collide with (and, via FLAG_UPDATE_CURRENT, clobber the extras of)
  // the alarm PendingIntent it accompanies. Large enough not to overlap the
  // 9201-9204 alarm codes.
  private const val SHOW_INTENT_REQUEST_CODE_OFFSET = 100

  // Request codes for the TEST-ONLY compressed window. They must differ from the
  // real START/STOP codes: SleepAlarmReceiver re-arms the real window after every
  // alarm fires, so a debug alarm sharing a request code gets overwritten by the
  // real (far-future) one the instant the debug START fires - which is exactly
  // how the debug STOP silently vanished before it could finalize anything.
  private const val DEBUG_START_REQUEST_CODE = 9211
  private const val DEBUG_STOP_REQUEST_CODE = 9212

  // How far past its nominal deadline an unfired STOP is still considered "in
  // flight" and protected from being overwritten. Doze and OEM alarm throttling
  // routinely delay alarms by minutes; without this slack a re-arm during that
  // delay would replace the pending STOP and the window would never finalize.
  // Bounded so a permanently-stuck row can't block scheduling forever.
  private const val LOST_STOP_OVERRUN_MS = 2L * 60L * 60L * 1000L // 2 hours

  fun scheduleNext(context: Context) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    // Check if we have exact alarm permission on API 31+
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
      Log.w(TAG, "Cannot schedule exact alarms - permission not granted")
      return
    }

    try {
      // Read sleep_settings from DB
      val settings = readSleepSettings(context) ?: return
      val (windowStartMin, windowEndMin) = settings

      val now = Calendar.getInstance()

      // --- Single anchor: the START instant of the current-or-next window ---
      //
      // All four alarms are derived as FIXED offsets from ONE anchor (the window
      // start instant), so they always describe the SAME night. This is the fix
      // for the old per-alarm "if past, add a day" logic: when the receiver
      // re-armed right after START fired, the independently-computed start had
      // already rolled to tomorrow and dragged STOP along with it, so a same-day
      // window (e.g. 17:00-18:00, or your 07:00-08:00) never got finalized that
      // day. Anchoring everything to one start instant keeps the whole set
      // internally consistent and honors exactly the HH:mm the user set (AM/PM
      // is already baked into the 0-1439 minute value).
      val startAnchor = resolveStartAnchor(windowStartMin, windowEndMin, now)

      // Window length in minutes. For a window that crosses midnight (end <=
      // start numerically, e.g. 23:00->07:00) add a full day so STOP lands on
      // the correct calendar day. Same-day windows (00:00->07:00, 07:00->08:00)
      // keep the plain difference.
      val rawLength = windowEndMin - windowStartMin
      val windowLengthMin = if (rawLength > 0) rawLength else rawLength + 24 * 60

      // Derive the other three instants as offsets from the single start anchor.
      val earlyReminderTime = offsetFrom(startAnchor, -EARLY_REMINDER_OFFSET_MIN)
      val finalReminderTime = offsetFrom(startAnchor, -FINAL_REMINDER_OFFSET_MIN)
      val startAlarmTime = startAnchor
      val stopAlarmTime = offsetFrom(startAnchor, windowLengthMin + STOP_GRACE_MIN)

      // Schedule each alarm, but ONLY if its trigger time is still in the future.
      //
      // This receiver re-arms all four alarms after EVERY alarm fires (see
      // SleepAlarmReceiver). When e.g. the early reminder fires at start-60m, the
      // anchor for the CURRENT (in-progress) window is still today, so earlyReminderTime
      // recomputes to start-60m == roughly "now, a few ms in the past". Handing a past
      // trigger time to setExactAndAllowWhileIdle makes Android fire it IMMEDIATELY,
      // which re-posts the notification and re-arms it in the past again -> an infinite
      // "alarm-like" repeat. Skipping past-due instants breaks that loop: the reminders
      // that already fired for the current window are simply not re-armed, and only the
      // still-future alarms (typically STOP, then the next night's set) stay scheduled.
      // The window this set of alarms describes. Carried on the START/STOP
      // intents so the service finalizes the occurrence that was actually
      // tracked, rather than re-deriving a window from the clock at fire time.
      val windowBedTimeMs = startAnchor.timeInMillis
      val windowWakeTimeMs = offsetFrom(startAnchor, windowLengthMin).timeInMillis

      scheduleAlarmIfFuture(context, alarmManager, earlyReminderTime, now, "ACTION_SLEEP_EARLY_REMINDER", EARLY_REMINDER_REQUEST_CODE)
      scheduleAlarmIfFuture(context, alarmManager, finalReminderTime, now, "ACTION_SLEEP_FINAL_REMINDER", FINAL_REMINDER_REQUEST_CODE)
      scheduleAlarmIfFuture(
        context, alarmManager, startAlarmTime, now, "ACTION_SLEEP_START", START_REQUEST_CODE,
        windowBedTimeMs, windowWakeTimeMs
      )
      // STOP is the one alarm that must never be clobbered by a re-arm.
      //
      // Two distinct hazards, both of which silently killed the wake-up summary:
      //
      //  1. Already finalized -> nothing left to do; just clear any stale alarm.
      //  2. Still UNFINALIZED but pending -> a re-arm here would compute the NEXT
      //     window's STOP and overwrite the one that hasn't fired yet. This is what
      //     happened at 16:00:56 for a 15:00-16:00 window: STOP was due at 16:06,
      //     the app re-armed, and today's STOP was replaced by tomorrow's. The
      //     window never finalized, so no notification and no summary row.
      //
      // Case 2 is caught by asking the DB whether an occurrence is still tracking
      // and its STOP deadline hasn't passed - a stronger test than the anchor's
      // date arithmetic, and one that survives Doze delaying STOP past its grace.
      val pendingStopMs = pendingUnfinalizedStopMs(context)
      when {
        isOccurrenceFinalized(context, windowWakeTimeMs) -> {
          cancelAlarm(context, alarmManager, "ACTION_SLEEP_STOP", STOP_REQUEST_CODE)
          Log.d(TAG, "Occurrence ending ${Date(windowWakeTimeMs)} already finalized; STOP not re-armed")
        }
        pendingStopMs != null && pendingStopMs != stopAlarmTime.timeInMillis -> {
          // Leave the in-flight STOP exactly as armed - do not touch it.
          Log.d(
            TAG,
            "Leaving in-flight STOP armed for ${Date(pendingStopMs)}; " +
              "not overwriting with ${stopAlarmTime.time}"
          )
        }
        else -> {
          scheduleAlarmIfFuture(
            context, alarmManager, stopAlarmTime, now, "ACTION_SLEEP_STOP", STOP_REQUEST_CODE,
            windowBedTimeMs, windowWakeTimeMs
          )
        }
      }

      Log.d(
        TAG,
        "Scheduled sleep alarms. start=${startAlarmTime.time} stop=${stopAlarmTime.time} " +
          "(windowLen=${windowLengthMin}min, early=${earlyReminderTime.time}, final=${finalReminderTime.time})"
      )
    } catch (e: Exception) {
      Log.e(TAG, "Failed to schedule alarms", e)
    }
  }

  /**
   * TEST HELPER. Arms a compressed sleep window starting [startInMinutes] from
   * now and running for [lengthMinutes], so the whole START -> track -> STOP ->
   * summary cycle can be exercised in a few minutes.
   *
   * It deliberately reuses the SAME scheduleAlarm/receiver/service path as a real
   * window - only the instants differ - so a passing test says something true
   * about production behavior. The 1-hour and 10-minute bedtime reminders are
   * skipped here only because they would land in the past for a short window.
   *
   * Call cancelAll() (or scheduleNext()) afterwards to return to the real window.
   */
  /**
   * Wall-clock instant the in-flight debug window's STOP is due, or 0 when no
   * debug window is running. Process-local on purpose: a test window never needs
   * to survive a restart, and keeping it out of the DB means the test harness
   * cannot perturb real tracking state.
   */
  @Volatile
  private var debugWindowStopDueAtMs: Long = 0L

  /**
   * True while a TEST window is still pending its STOP. SleepAlarmReceiver
   * consults this to suppress the routine re-arm of the REAL window: that re-arm
   * runs after every alarm fires and would otherwise overwrite the debug STOP
   * with the real window's far-future one, so the test window could start but
   * never finalize.
   */
  fun isDebugWindowInFlight(): Boolean {
    return debugWindowStopDueAtMs > 0L && System.currentTimeMillis() < debugWindowStopDueAtMs
  }

  fun scheduleDebugWindow(context: Context, startInMinutes: Int, lengthMinutes: Int) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
      Log.w(TAG, "Cannot schedule debug window - exact alarm permission not granted")
      return
    }

    val now = Calendar.getInstance()
    val startAnchor = offsetFrom(now, startInMinutes)
    val wakeInstant = offsetFrom(startAnchor, lengthMinutes)
    // Short grace so the test doesn't wait the full 6 minutes production uses.
    val stopInstant = offsetFrom(wakeInstant, 1)

    val bedTimeMs = startAnchor.timeInMillis
    val wakeTimeMs = wakeInstant.timeInMillis

    scheduleAlarm(
      context, alarmManager, startAnchor, "ACTION_SLEEP_START", DEBUG_START_REQUEST_CODE,
      bedTimeMs, wakeTimeMs
    )
    scheduleAlarm(
      context, alarmManager, stopInstant, "ACTION_SLEEP_STOP", DEBUG_STOP_REQUEST_CODE,
      bedTimeMs, wakeTimeMs
    )

    // Suppress the real window's re-arm until this test STOP has fired (plus a
    // small margin so the receiver's own post-STOP re-arm still counts as
    // in-flight and doesn't race the finalize).
    debugWindowStopDueAtMs = stopInstant.timeInMillis + 30_000L

    Log.d(TAG, "DEBUG window armed: start=${startAnchor.time} wake=${wakeInstant.time} stop=${stopInstant.time}")
  }

  fun cancelAll(context: Context) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    try {
      // Rebuild and cancel all four PendingIntents
      cancelAlarm(context, alarmManager, "ACTION_SLEEP_EARLY_REMINDER", EARLY_REMINDER_REQUEST_CODE)
      cancelAlarm(context, alarmManager, "ACTION_SLEEP_FINAL_REMINDER", FINAL_REMINDER_REQUEST_CODE)
      cancelAlarm(context, alarmManager, "ACTION_SLEEP_START", START_REQUEST_CODE)
      cancelAlarm(context, alarmManager, "ACTION_SLEEP_STOP", STOP_REQUEST_CODE)

      // Also clear any test window, so cancelling always leaves a clean slate.
      cancelAlarm(context, alarmManager, "ACTION_SLEEP_START", DEBUG_START_REQUEST_CODE)
      cancelAlarm(context, alarmManager, "ACTION_SLEEP_STOP", DEBUG_STOP_REQUEST_CODE)
      debugWindowStopDueAtMs = 0L

      Log.d(TAG, "Cancelled all 4 alarms")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to cancel alarms", e)
    }
  }

  /**
   * Schedules an exact alarm only when [triggerTime] is still in the future. A past (or
   * now) trigger time would be fired immediately by AlarmManager, which - because the
   * receiver re-arms on every fire - produces a self-perpetuating "alarm" loop. Cancels any
   * previously-armed instance of this alarm when its time has passed so a stale pending
   * intent can't linger.
   */
  private fun scheduleAlarmIfFuture(
    context: Context,
    alarmManager: AlarmManager,
    triggerTime: Calendar,
    now: Calendar,
    action: String,
    requestCode: Int,
    windowBedTimeMs: Long? = null,
    windowWakeTimeMs: Long? = null
  ) {
    if (triggerTime.after(now)) {
      scheduleAlarm(context, alarmManager, triggerTime, action, requestCode, windowBedTimeMs, windowWakeTimeMs)
    } else {
      cancelAlarm(context, alarmManager, action, requestCode)
      Log.d(TAG, "Skipped past-due alarm $action (would have fired at ${triggerTime.time})")
    }
  }

  private fun scheduleAlarm(
    context: Context,
    alarmManager: AlarmManager,
    triggerTime: Calendar,
    action: String,
    requestCode: Int,
    windowBedTimeMs: Long? = null,
    windowWakeTimeMs: Long? = null
  ) {
    val intent = Intent(context, SleepAlarmReceiver::class.java).apply {
      this.action = action
      if (windowBedTimeMs != null) putExtra(EXTRA_BED_TIME_MS, windowBedTimeMs)
      if (windowWakeTimeMs != null) putExtra(EXTRA_WAKE_TIME_MS, windowWakeTimeMs)
    }

    val pendingIntent = PendingIntent.getBroadcast(context, requestCode, intent, FLAGS)

    // Use setAlarmClock (the highest-priority alarm type) instead of
    // setExactAndAllowWhileIdle. setAlarmClock is treated by the OS like a real
    // user wake-up alarm: it is the most resistant to Doze AND - critically - to
    // the aggressive background-app / alarm killing on OEM skins (MIUI/Xiaomi,
    // Samsung, Oppo, OnePlus, Vivo, etc.), which routinely drop ordinary exact
    // alarms once the app is backgrounded or swiped away. It also surfaces the
    // status-bar alarm icon. This is the standard fix for "the reminder never
    // fired on my real phone" while working fine on a stock-Android emulator.
    //
    // NOTE: even setAlarmClock cannot fully override a device where the user (or
    // the OEM by default) has disabled Autostart / put the app under battery
    // restrictions - those still require the user to allow autostart and set the
    // app to unrestricted battery. This just gives us the best chance the OS API
    // allows.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
      // The "show" intent opens the app when the user taps the status-bar alarm chip.
      //
      // It MUST use a distinct request code and carry the same extras. Intent
      // equality ignores extras, so a show intent sharing `requestCode` matches
      // the alarm's PendingIntent, and FLAG_UPDATE_CURRENT then overwrites the
      // alarm's extras with this one's - which is how the window instants
      // arrived at the receiver as bed=0 wake=0 and no occurrence was recorded.
      val showIntent = Intent(context, SleepAlarmReceiver::class.java).apply {
        this.action = action
        if (windowBedTimeMs != null) putExtra(EXTRA_BED_TIME_MS, windowBedTimeMs)
        if (windowWakeTimeMs != null) putExtra(EXTRA_WAKE_TIME_MS, windowWakeTimeMs)
      }
      val showPending =
        PendingIntent.getBroadcast(context, requestCode + SHOW_INTENT_REQUEST_CODE_OFFSET, showIntent, FLAGS)
      val info = AlarmManager.AlarmClockInfo(triggerTime.timeInMillis, showPending)
      alarmManager.setAlarmClock(info, pendingIntent)
    } else {
      @Suppress("DEPRECATION")
      alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerTime.timeInMillis, pendingIntent)
    }

    Log.d(TAG, "Scheduled alarm $action at ${triggerTime.time}")
  }

  private fun cancelAlarm(
    context: Context,
    alarmManager: AlarmManager,
    action: String,
    requestCode: Int
  ) {
    val intent = Intent(context, SleepAlarmReceiver::class.java).apply {
      this.action = action
    }

    // Look the existing PendingIntent up with FLAG_NO_CREATE rather than
    // FLAG_UPDATE_CURRENT: the latter would rewrite the live alarm's extras with
    // this extra-less intent as a side effect of trying to cancel it, wiping the
    // window instants off an alarm we may not even end up cancelling.
    val cancelFlags = PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
    PendingIntent.getBroadcast(context, requestCode, intent, cancelFlags)?.let {
      alarmManager.cancel(it)
      it.cancel()
    }
    PendingIntent.getBroadcast(
      context, requestCode + SHOW_INTENT_REQUEST_CODE_OFFSET, intent, cancelFlags
    )?.cancel()

    Log.d(TAG, "Cancelled alarm $action")
  }

  /**
   * Resolves the START instant for the window occurrence we should be tracking:
   * the next window whose *end* is still in the future. This is the single
   * anchor every other alarm is derived from.
   *
   * Honors exactly the HH:mm the user set (AM/PM already baked into the 0-1439
   * minute values) - it never invents a different time, it only picks which
   * calendar day the literal start time lands on:
   *
   *  - Today's start, if that window (start..end) hasn't fully ended yet - so a
   *    window still in progress, or later today, is tracked today.
   *  - Otherwise tomorrow's start.
   *
   * Examples (all handled by the same logic):
   *   00:00 -> 07:00  same-day; start today at 00:00 if before 07:00, else tomorrow.
   *   23:00 -> 07:00  crosses midnight; window length 8h, end is next-day 07:00.
   *   07:00 -> 08:00  same-day 1h window.
   */
  private fun resolveStartAnchor(windowStartMin: Int, windowEndMin: Int, now: Calendar): Calendar {
    val rawLength = windowEndMin - windowStartMin
    val windowLengthMin = if (rawLength > 0) rawLength else rawLength + 24 * 60

    // Today's start instant at the literal HH:mm.
    val startToday = Calendar.getInstance().apply {
      timeInMillis = now.timeInMillis
      set(Calendar.HOUR_OF_DAY, windowStartMin / 60)
      set(Calendar.MINUTE, windowStartMin % 60)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }

    // The end of the window that starts at startToday.
    val endToday = Calendar.getInstance().apply {
      timeInMillis = startToday.timeInMillis
      add(Calendar.MINUTE, windowLengthMin)
    }

    // Today's window is still "current" until its STOP has had a chance to fire,
    // i.e. until end + STOP_GRACE_MIN - NOT merely until end.
    //
    // This grace matters: STOP is armed at end+6min, so during those 6 minutes the
    // window has ended but has NOT been finalized yet. Rolling the anchor to
    // tomorrow the instant `end` passed meant any re-arm inside that gap (the app
    // being opened, a screen event, scheduleSleepTracking() on resume) recomputed
    // STOP for TOMORROW and overwrote the still-pending one for TODAY. The window
    // then never finalized: no wake-up notification, no summary row, so the card
    // and graph stayed empty. Extending the boundary past the grace keeps the
    // in-flight occurrence anchored to today until it has actually been finalized.
    val endTodayWithGrace = Calendar.getInstance().apply {
      timeInMillis = endToday.timeInMillis
      add(Calendar.MINUTE, STOP_GRACE_MIN)
    }

    return if (endTodayWithGrace.after(now)) {
      startToday
    } else {
      Calendar.getInstance().apply {
        timeInMillis = startToday.timeInMillis
        add(Calendar.DAY_OF_MONTH, 1)
      }
    }
  }

  /** A fixed minute offset from the anchor instant (negative = before). */
  private fun offsetFrom(anchor: Calendar, offsetMinutes: Int): Calendar {
    return Calendar.getInstance().apply {
      timeInMillis = anchor.timeInMillis
      add(Calendar.MINUTE, offsetMinutes)
    }
  }

  /**
   * True when the occurrence ending at [wakeTimeMs] has already been finalized,
   * so its STOP alarm must not be re-armed. Opened read-write + WAL for the same
   * reason as readSleepSettings: a plain read-only connection would miss the
   * service's just-committed finalize sitting in the -wal file.
   */
  /**
   * The STOP deadline of an occurrence that is still 'tracking' and whose STOP has
   * not fired yet, or null when there is none.
   *
   * This guards the real-world failure seen on 2026-07-21: a 15:00-16:00 window had
   * STOP armed for 16:06, a reminder alarm at 16:00 brought the app to the
   * foreground, app startup called scheduleSleepTracking(), and scheduleNext()
   * recomputed STOP for the NEXT window - overwriting the pending one. The window
   * never finalized: no wake-up notification, no summary row, empty card and graph.
   *
   * Note this protects sleep tracking from ITSELF. The reminder-alarm module uses
   * separate PendingIntents and a different receiver, so the two alarm sets never
   * collide - a reminder and a sleep event at the same minute both fire normally.
   *
   * Asking the DB "is an occurrence still tracking?" is stronger than the anchor's
   * date arithmetic because it stays true even when Doze delays STOP past its grace.
   */
  private fun pendingUnfinalizedStopMs(context: Context): Long? {
    var db: SQLiteDatabase? = null
    return try {
      val dbFile = File(context.filesDir, "SQLite/healthapp.db")
      if (!dbFile.exists()) return null

      db = SafeDb.openAt(dbFile)
      val session = SleepSessionRepo.findLatestTracking(db) ?: return null

      val stopDueMs = session.wakeTimeMs + STOP_GRACE_MIN * 60_000L
      if (System.currentTimeMillis() < stopDueMs + LOST_STOP_OVERRUN_MS) stopDueMs else null
    } catch (e: Exception) {
      // Missing sleep_sessions table (install predating the migration) lands here
      // - treat as "nothing pending" so scheduling behaves as it did before.
      Log.w(TAG, "Could not check pending STOP", e)
      null
    } finally {
      db?.close()
    }
  }

  private fun isOccurrenceFinalized(context: Context, wakeTimeMs: Long): Boolean {
    var db: SQLiteDatabase? = null
    return try {
      val dbFile = File(context.filesDir, "SQLite/healthapp.db")
      if (!dbFile.exists()) return false

      db = SafeDb.openAt(dbFile)
      SleepSessionRepo.isAlreadyFinalized(db, wakeTimeMs)
    } catch (e: Exception) {
      // A missing sleep_sessions table (install predating the migration) lands
      // here - treat as "not finalized" so scheduling behaves as it did before.
      Log.w(TAG, "Could not check occurrence status", e)
      false
    } finally {
      db?.close()
    }
  }

  private fun readSleepSettings(context: Context): Pair<Int, Int>? {
    var db: SQLiteDatabase? = null
    return try {
      val dbFile = File(context.filesDir, "SQLite/healthapp.db")
      if (!dbFile.exists()) return null

      // IMPORTANT: open read-WRITE, NOT plain OPEN_READONLY.
      //
      // The JS side (expo-sqlite) runs the DB in WAL mode and its UPDATE to the
      // sleep window lands in the -wal file first (not yet checkpointed into the
      // main .db). A connection opened plain-READONLY does not attach the -wal,
      // so it reads the STALE pre-update value from the main db file - which is
      // exactly why a freshly-saved window (e.g. 03:40) was ignored and the
      // scheduler kept re-arming the old 23:00 default.
      //
      // Read-write is all that is needed for that: WAL is already on (a
      // persistent property of the file), so this connection reads the JS
      // connection's committed frames automatically. It must NOT additionally
      // call enableWriteAheadLogging() - that makes Android's framework SQLite
      // seize WAL ownership of a file journalled by expo-sqlite's bundled libsql
      // engine, which corrupted the database. See SafeDb.
      db = SafeDb.openAt(dbFile)
      db.rawQuery("SELECT window_start, window_end FROM sleep_settings WHERE id = 1;", null).use { c ->
        if (c.moveToFirst() && !c.isNull(0) && !c.isNull(1)) {
          val windowStart = c.getString(0)  // 'HH:mm'
          val windowEnd = c.getString(1)    // 'HH:mm'
          val startMin = timeToMinutes(windowStart)
          val endMin = timeToMinutes(windowEnd)
          Pair(startMin, endMin)
        } else null
      }
    } catch (e: Exception) {
      Log.w(TAG, "Could not read sleep settings", e)
      null
    } finally {
      db?.close()
    }
  }

  private fun timeToMinutes(hhmm: String): Int {
    val parts = hhmm.split(":")
    val h = parts[0].toIntOrNull() ?: 0
    val m = parts[1].toIntOrNull() ?: 0
    return h * 60 + m
  }
}
