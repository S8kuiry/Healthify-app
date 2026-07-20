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
      scheduleAlarmIfFuture(context, alarmManager, earlyReminderTime, now, "ACTION_SLEEP_EARLY_REMINDER", EARLY_REMINDER_REQUEST_CODE)
      scheduleAlarmIfFuture(context, alarmManager, finalReminderTime, now, "ACTION_SLEEP_FINAL_REMINDER", FINAL_REMINDER_REQUEST_CODE)
      scheduleAlarmIfFuture(context, alarmManager, startAlarmTime, now, "ACTION_SLEEP_START", START_REQUEST_CODE)
      scheduleAlarmIfFuture(context, alarmManager, stopAlarmTime, now, "ACTION_SLEEP_STOP", STOP_REQUEST_CODE)

      Log.d(
        TAG,
        "Scheduled sleep alarms. start=${startAlarmTime.time} stop=${stopAlarmTime.time} " +
          "(windowLen=${windowLengthMin}min, early=${earlyReminderTime.time}, final=${finalReminderTime.time})"
      )
    } catch (e: Exception) {
      Log.e(TAG, "Failed to schedule alarms", e)
    }
  }

  fun cancelAll(context: Context) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

    try {
      // Rebuild and cancel all four PendingIntents
      cancelAlarm(context, alarmManager, "ACTION_SLEEP_EARLY_REMINDER", EARLY_REMINDER_REQUEST_CODE)
      cancelAlarm(context, alarmManager, "ACTION_SLEEP_FINAL_REMINDER", FINAL_REMINDER_REQUEST_CODE)
      cancelAlarm(context, alarmManager, "ACTION_SLEEP_START", START_REQUEST_CODE)
      cancelAlarm(context, alarmManager, "ACTION_SLEEP_STOP", STOP_REQUEST_CODE)

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
    requestCode: Int
  ) {
    if (triggerTime.after(now)) {
      scheduleAlarm(context, alarmManager, triggerTime, action, requestCode)
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
    requestCode: Int
  ) {
    val intent = Intent(context, SleepAlarmReceiver::class.java).apply {
      this.action = action
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
      val showIntent = Intent(context, SleepAlarmReceiver::class.java).apply {
        this.action = action
      }
      val showPending = PendingIntent.getBroadcast(context, requestCode, showIntent, FLAGS)
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

    val pendingIntent = PendingIntent.getBroadcast(context, requestCode, intent, FLAGS)
    alarmManager.cancel(pendingIntent)
    pendingIntent.cancel()

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

    // If today's window has already fully ended, track tomorrow's instead.
    // Using the END (not the start) means an in-progress window is still tracked
    // today, and re-arming right after START fires keeps the SAME night's start
    // (its end is still in the future) instead of jumping a day.
    return if (endToday.after(now)) {
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

  private fun readSleepSettings(context: Context): Pair<Int, Int>? {
    var db: SQLiteDatabase? = null
    return try {
      val dbFile = File(context.filesDir, "SQLite/healthapp.db")
      if (!dbFile.exists()) return null

      // IMPORTANT: open read-WRITE with WAL enabled, NOT plain OPEN_READONLY.
      //
      // The JS side (expo-sqlite) runs the DB in WAL mode and its UPDATE to the
      // sleep window lands in the -wal file first (not yet checkpointed into the
      // main .db). A separate connection opened with plain OPEN_READONLY does not
      // attach the -wal, so it reads the STALE pre-update value from the main db
      // file - which is exactly why a freshly-saved window (e.g. 03:40) was
      // ignored and the scheduler kept re-arming the old 23:00 default.
      // Opening read-write + enableWriteAheadLogging() makes this connection a
      // proper WAL reader that sees the JS connection's committed frames.
      db = SQLiteDatabase.openDatabase(dbFile.absolutePath, null, SQLiteDatabase.OPEN_READWRITE)
      db.enableWriteAheadLogging()
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
