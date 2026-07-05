package expo.modules.steptracker

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat

object StepTrackerServiceStarter {
  private const val TAG = "StepTrackerServiceStarter"

  fun start(context: Context): Boolean {
    if (StepTrackerService.isRunning) return true

    return try {
      val intent = Intent(context, StepTrackerService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ContextCompat.startForegroundService(context, intent)
      } else {
        context.startService(intent)
      }
      true
    } catch (e: Exception) {
      Log.e(TAG, "Failed to start StepTrackerService", e)
      false
    }
  }
}
