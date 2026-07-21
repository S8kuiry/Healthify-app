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
        // Start the foreground service silently, handing it the concrete window
        // instants this alarm was armed for so it can record the occurrence.
        ScreenActivityService.startForWindow(
          context,
          intent.getLongExtra(SleepTrackingAlarmScheduler.EXTRA_BED_TIME_MS, 0L),
          intent.getLongExtra(SleepTrackingAlarmScheduler.EXTRA_WAKE_TIME_MS, 0L)
        )
      }
      "ACTION_SLEEP_STOP" -> {
        // Send finalize intent to the service, forwarding the SAME window this
        // alarm was armed for. Finalizing by the stored occurrence (rather than
        // by a freshly-derived window) is what keeps a same-day window from
        // being finalized against the next day's occurrence.
        val serviceIntent = Intent(context, ScreenActivityService::class.java)
        serviceIntent.action = "ACTION_FINALIZE_AND_STOP"
        serviceIntent.putExtra(
          SleepTrackingAlarmScheduler.EXTRA_WAKE_TIME_MS,
          intent.getLongExtra(SleepTrackingAlarmScheduler.EXTRA_WAKE_TIME_MS, 0L)
        )
        ContextCompat.startForegroundService(context, serviceIntent)
      }
    }

    // Re-arm all alarms for the next occurrence.
    //
    // Skipped while a TEST window is mid-flight: this re-arm runs after EVERY
    // alarm fires, and re-arming the real window would overwrite the pending
    // test STOP with the real one, so a test window would start but never
    // finalize. Real windows are unaffected - isDebugWindowInFlight() is only
    // ever true between a debugRunSleepWindow() call and its STOP.
    if (SleepTrackingAlarmScheduler.isDebugWindowInFlight()) {
      Log.d("SleepAlarmReceiver", "Debug window in flight; skipping real-window re-arm")
    } else {
      SleepTrackingAlarmScheduler.scheduleNext(context)
    }
  }
}
