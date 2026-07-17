package expo.modules.screenactivity

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.content.ContextCompat

class SleepAlarmReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    Log.d("SleepAlarmReceiver", "Received alarm action: $action")

    when (action) {
      "ACTION_SLEEP_EARLY_REMINDER" -> {
        SleepReminderNotifier.postEarlyReminder(context)
      }
      "ACTION_SLEEP_FINAL_REMINDER" -> {
        SleepReminderNotifier.postFinalReminder(context)
      }
      "ACTION_SLEEP_START" -> {
        // Start the foreground service silently
        ScreenActivityService.start(context)
      }
      "ACTION_SLEEP_STOP" -> {
        // Send finalize intent to the service
        val serviceIntent = Intent(context, ScreenActivityService::class.java)
        serviceIntent.action = "ACTION_FINALIZE_AND_STOP"
        ContextCompat.startForegroundService(context, serviceIntent)
      }
    }

    // Re-arm all alarms for the next occurrence
    SleepTrackingAlarmScheduler.scheduleNext(context)
  }
}
