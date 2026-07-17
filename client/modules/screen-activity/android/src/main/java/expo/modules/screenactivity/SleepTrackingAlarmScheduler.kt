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
      val today = Calendar.getInstance().apply {
        set(Calendar.HOUR_OF_DAY, 0)
        set(Calendar.MINUTE, 0)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
      }

      // Compute alarm times for today (or tomorrow if already past)
      val earlyReminderTime = computeAlarmTime(today, windowStartMin - EARLY_REMINDER_OFFSET_MIN, now)
      val finalReminderTime = computeAlarmTime(today, windowStartMin - FINAL_REMINDER_OFFSET_MIN, now)
      val startAlarmTime = computeAlarmTime(today, windowStartMin, now)

      // Stop alarm time: if window crosses midnight, stop is the next day
      val stopAlarmCalendar = Calendar.getInstance().apply { timeInMillis = startAlarmTime.timeInMillis }
      val crossesMidnight = windowEndMin <= windowStartMin
      if (crossesMidnight) {
        stopAlarmCalendar.add(Calendar.DAY_OF_MONTH, 1)
      }
      val stopMinutes = windowEndMin + STOP_GRACE_MIN
      stopAlarmCalendar.set(Calendar.HOUR_OF_DAY, stopMinutes / 60)
      stopAlarmCalendar.set(Calendar.MINUTE, stopMinutes % 60)
      stopAlarmCalendar.set(Calendar.SECOND, 0)
      val stopAlarmTime = stopAlarmCalendar

      // Schedule all four alarms
      scheduleAlarm(context, alarmManager, earlyReminderTime, "ACTION_SLEEP_EARLY_REMINDER", EARLY_REMINDER_REQUEST_CODE)
      scheduleAlarm(context, alarmManager, finalReminderTime, "ACTION_SLEEP_FINAL_REMINDER", FINAL_REMINDER_REQUEST_CODE)
      scheduleAlarm(context, alarmManager, startAlarmTime, "ACTION_SLEEP_START", START_REQUEST_CODE)
      scheduleAlarm(context, alarmManager, stopAlarmTime, "ACTION_SLEEP_STOP", STOP_REQUEST_CODE)

      Log.d(TAG, "Scheduled all 4 alarms successfully")
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

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerTime.timeInMillis, pendingIntent)
    } else {
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

  private fun computeAlarmTime(baseDate: Calendar, minutes: Int, now: Calendar): Calendar {
    val result = Calendar.getInstance().apply {
      timeInMillis = baseDate.timeInMillis
      set(Calendar.HOUR_OF_DAY, minutes / 60)
      set(Calendar.MINUTE, minutes % 60)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }

    // If already past this time, use tomorrow instead
    if (result.before(now)) {
      result.add(Calendar.DAY_OF_MONTH, 1)
    }

    return result
  }

  private fun readSleepSettings(context: Context): Pair<Int, Int>? {
    var db: SQLiteDatabase? = null
    return try {
      val dbFile = File(context.filesDir, "SQLite/healthapp.db")
      if (!dbFile.exists()) return null

      db = SQLiteDatabase.openDatabase(dbFile.absolutePath, null, SQLiteDatabase.OPEN_READONLY)
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
