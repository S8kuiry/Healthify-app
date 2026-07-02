package expo.modules.steptracker

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class StepTrackerModule : Module() {
  private var foregroundServiceActive = false

  private fun applicationContext(): Context? {
    return appContext.reactContext?.applicationContext
      ?: appContext.currentActivity?.applicationContext
  }

  private fun hasActivityRecognitionPermission(context: Context): Boolean {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return true
    return ContextCompat.checkSelfPermission(
      context,
      Manifest.permission.ACTIVITY_RECOGNITION
    ) == PackageManager.PERMISSION_GRANTED
  }

  override fun definition() = ModuleDefinition {
    Name("StepTracker")
    Events("onStepUpdate")

    OnCreate {
      StepTrackerEventDispatcher.setEmitter { name, payload ->
        sendEvent(name, payload)
      }
    }

    OnDestroy {
      StepTrackerEventDispatcher.clearEmitter()
    }

    Function("hasStepSensor") {
      val context = applicationContext() ?: return@Function false
      val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as android.hardware.SensorManager
      return@Function sensorManager.getDefaultSensor(android.hardware.Sensor.TYPE_STEP_COUNTER) != null
    }

    Function("setActivityProfile") { heightCm: Double, weightKg: Double, stepGoal: Int, calorieGoal: Int ->
      val context = applicationContext() ?: return@Function false
      StepCounterStore.setActivityProfile(context, heightCm, weightKg, stepGoal, calorieGoal)
      if (foregroundServiceActive) {
        StepTrackerNotification.refresh(context)
      }
      return@Function true
    }

    Function("getTodaySteps") {
      val context = applicationContext() ?: return@Function -1
      return@Function StepCounterStore.getTodaySteps(context)
    }

    Function("startForegroundTracking") {
      val context = applicationContext() ?: return@Function false
      foregroundServiceActive = true
      val intent = Intent(context, StepTrackerService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      return@Function true
    }

    Function("stopForegroundTracking") {
      val context = applicationContext() ?: return@Function false
      foregroundServiceActive = false
      val intent = Intent(context, StepTrackerService::class.java)
      context.stopService(intent)
      return@Function true
    }
  }
}