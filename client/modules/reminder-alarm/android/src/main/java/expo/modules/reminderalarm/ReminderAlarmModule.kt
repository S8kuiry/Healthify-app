package expo.modules.reminderalarm

import android.app.AlarmManager
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.net.Uri
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
  

    // Full-screen intent permission. On Android 14 (API 34)+ this is NOT auto-granted
    // to every app — without it, the alarm notification degrades to a heads-up card and
    // the full-screen AlarmActivity won't pop from the background / lock screen.
    AsyncFunction("hasFullScreenIntentPermission") { ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        val nm = applicationContext().getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.canUseFullScreenIntent()
      } else {
        true // Granted at install time on Android 13 and below
      }
    }

    AsyncFunction("openFullScreenIntentSettings") { ->
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
        val intent = Intent(Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT).apply {
          data = Uri.parse("package:" + applicationContext().packageName)
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