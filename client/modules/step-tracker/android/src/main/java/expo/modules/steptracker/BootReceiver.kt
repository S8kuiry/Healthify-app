package expo.modules.steptracker

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
    if (!StepCounterStore.isTrackingEnabled(context)) return

    Log.d("BootReceiver", "Device booted, restarting StepTrackerService")
    StepTrackerServiceStarter.start(context)
  }
}
