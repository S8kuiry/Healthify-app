package expo.modules.screenactivity

import android.app.AppOpsManager
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Process
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ScreenActivityModule : Module() {

  private fun applicationContext(): Context {
    return appContext.reactContext?.applicationContext
      ?: appContext.currentActivity?.applicationContext
      ?: throw IllegalStateException("ScreenActivityModule: application context unavailable")
  }

  override fun definition() = ModuleDefinition {
    Name("ScreenActivity")

    Events("onScreenEvent")

    // Called automatically by expo-modules-core when the first JS listener subscribes to
    // "onScreenEvent". This is where we hook the dispatcher (file 1) up to sendEvent, so we
    // only pay the cost of forwarding events while something on the JS side actually cares.
    OnStartObserving {
      ScreenActivityEventDispatcher.setListener { event ->
        sendEvent(
          "onScreenEvent",
          mapOf(
            "type" to event.type,
            "timestampMs" to event.timestampMs.toDouble() // Bridge doesn't support Long; Double is safe up to 2^53ms (~285,000 years)
          )
        )
      }
    }

    // Called when the last JS listener unsubscribes.
    OnStopObserving {
      ScreenActivityEventDispatcher.setListener(null)
    }

    // Starts the foreground service that keeps the screen receiver alive. Call this once,
    // e.g. on app start or when the user enables Screen Activity / Sleep tracking.
    AsyncFunction("startTracking") { ->
      ScreenActivityService.start(applicationContext())
    }

    // Stops the foreground service. After this, screen events will no longer be captured.
    AsyncFunction("stopTracking") { ->
      ScreenActivityService.stop(applicationContext())
    }

    AsyncFunction("isTracking") { ->
      ScreenActivityEventDispatcher.hasListener()
    }

    // Schedules the sleep-tracking alarms based on the current sleep_settings.
    // Called on app startup and whenever sleep settings change.
    AsyncFunction("scheduleSleepTracking") { ->
      SleepTrackingAlarmScheduler.scheduleNext(applicationContext())
    }

    // Cancels all sleep-tracking alarms.
    AsyncFunction("cancelSleepTracking") { ->
      SleepTrackingAlarmScheduler.cancelAll(applicationContext())
    }

    // --- Test helper ---
    // Runs a compressed sleep window starting [startInMinutes] from now and
    // lasting [lengthMinutes], so the full START -> track -> STOP -> summary
    // notification -> card cycle can be verified in minutes instead of waiting
    // for real bedtime. Uses the SAME code path as a real window (it just moves
    // the instants), so what you observe is what production does.
    AsyncFunction("debugRunSleepWindow") { startInMinutes: Int, lengthMinutes: Int ->
      SleepTrackingAlarmScheduler.scheduleDebugWindow(
        applicationContext(),
        startInMinutes,
        lengthMinutes
      )
    }

    // --- Usage-access permission helpers (for the later per-app breakdown feature) ---
    // These are unrelated to the screen on/off receiver above (which needs no special
    // permission) - UsageStatsManager access requires the user to manually grant it via a
    // dedicated Settings screen, since it is not a normal runtime permission dialog.

    AsyncFunction("hasUsageAccessPermission") { ->
      val appOps = applicationContext().getSystemService(Context.APP_OPS_SERVICE) as AppOpsManager
      val mode = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        appOps.unsafeCheckOpNoThrow(
          AppOpsManager.OPSTR_GET_USAGE_STATS,
          Process.myUid(),
          applicationContext().packageName
        )
      } else {
        @Suppress("DEPRECATION")
        appOps.checkOpNoThrow(
          AppOpsManager.OPSTR_GET_USAGE_STATS,
          Process.myUid(),
          applicationContext().packageName
        )
      }
      mode == AppOpsManager.MODE_ALLOWED
    }

    AsyncFunction("openUsageAccessSettings") { ->
      val intent = Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS).apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        data = Uri.parse("package:" + applicationContext().packageName)
      }
      applicationContext().startActivity(intent)
    }
  }
}