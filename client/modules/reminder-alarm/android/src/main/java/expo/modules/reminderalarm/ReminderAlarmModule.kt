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
import android.media.RingtoneManager // 🔊 Essential for managing system playback
import android.media.Ringtone        // 🔊 Tracks the active audio instance

class ReminderAlarmModule : Module() {
  // 🔊 Tracks the ringtone currently playing for preview
  private var currentPreviewRingtone: Ringtone? = null

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

    AsyncFunction("scheduleAlarm") { id: String, label: String, timestampMs: Double, repeat: Boolean ->
      AlarmScheduler.schedule(applicationContext(), id, label, timestampMs.toLong(), repeat)
    }

    AsyncFunction("cancelAlarm") { id: String ->
      AlarmScheduler.cancel(applicationContext(), id)
    }

    // Retrieve the list of system alarms (ringtones) available on the device

    AsyncFunction("getSystemAlarms") { ->
      val ringtoneManager = RingtoneManager(applicationContext()).apply {
          setType(RingtoneManager.TYPE_ALARM)
      }
      val cursor = ringtoneManager.cursor
      val alarmList = ArrayList<Map<String, String>>()

      while (cursor.moveToNext()) {
          val title = cursor.getString(RingtoneManager.TITLE_COLUMN_INDEX)
          val uri = ringtoneManager.getRingtoneUri(cursor.position).toString()
          alarmList.add(mapOf("title" to title, "uri" to uri))
      }
      alarmList
    }

    // The system's default alarm tone URI. On a fresh install the app has no
    // saved tone, and AlarmService falls back to this exact tone at ring time
    // (see AlarmService.kt). The settings screen uses this to pre-select /
    // green-mark the tone that is actually in use before the user picks one.
    //
    // We resolve to the *actual* underlying tone URI (not the abstract
    // "default alarm" content://settings/... alias) so the returned string
    // matches one of the getSystemAlarms() list entries and highlights it.
    AsyncFunction("getDefaultAlarmUri") { ->
      val ctx = applicationContext()
      val uri =
        RingtoneManager.getActualDefaultRingtoneUri(ctx, RingtoneManager.TYPE_ALARM)
          ?: RingtoneManager.getActualDefaultRingtoneUri(ctx, RingtoneManager.TYPE_RINGTONE)
          ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      uri?.toString()
    }


    // 🔊 1. Play the selected ringtone preview
    AsyncFunction("playAlarmPreview") { uriString: String ->
      // Stop whatever tone is currently playing before starting a new one
      currentPreviewRingtone?.stop()

      val uri = Uri.parse(uriString)
      currentPreviewRingtone = RingtoneManager.getRingtone(applicationContext(), uri)
      currentPreviewRingtone?.play()
    }

    // 🔊 2. Stop the playback (useful when user leaves the screen)
    AsyncFunction("stopAlarmPreview") { ->
      currentPreviewRingtone?.stop()
      currentPreviewRingtone = null
    }



  }
}