package expo.modules.screenactivity

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_BOOT_COMPLETED) {
      Log.d("BootReceiver", "Device boot completed, re-arming sleep tracking alarms")
      // Re-schedule all alarms for the first time after reboot
      SleepTrackingAlarmScheduler.scheduleNext(context)
    }
  }
}
