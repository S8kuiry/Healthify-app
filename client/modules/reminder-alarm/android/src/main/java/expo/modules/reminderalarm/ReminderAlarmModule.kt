package expo.modules.reminderalarm

import android.app.AlarmManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ReminderAlarmModule : Module() {
  private fun applicationContext(): Context {
    return appContext.reactContext?.applicationContext
      ?: appContext.currentActivity?.applicationContext
      ?: throw IllegalStateException("ReminderAlarmModule: application context unavailable")
  }

  override fun definition() = ModuleDefinition {
    Name("ReminderAlarmModule")

    AsyncFunction("hasExactAlarmPermission"){->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
        val alarmManager = applicationContext().getSystemService(Context.ALARM_SERVICE) as AlarmManager
        alarmManager.canScheduleExactAlarms() // Returns Boolean true/false
      } else {
        true // Android 11 and below grant this automatically
      }
    }

    // 2. Separate intent trigger to open the system settings page explicitly
    AsyncFunction("openExactAlarmSettings") { ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).apply {
              addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          applicationContext().startActivity(intent)
      }
  }
  

    AsyncFunction("scheduleAlarm") { id: String, label: String, timestampMs: Double ->
      AlarmScheduler.schedule(applicationContext(), id, label, timestampMs.toLong())
    }

    AsyncFunction("cancelAlarm") { id: String ->
      AlarmScheduler.cancel(applicationContext(), id)
    }
  }
}