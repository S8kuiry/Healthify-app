package expo.modules.steptracker

import android.Manifest
import android.content.Context
import android.content.SharedPreferences
import android.content.pm.PackageManager
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class StepTrackerModule : Module() {
  private var latestRawSteps: Int = -1

  private var sensorManager: SensorManager? = null
  private var stepSensor: Sensor? = null
  private var prefs: SharedPreferences? = null
  private var isListenerRegistered = false

  private val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)
  private fun todayDateString(): String = dateFormat.format(Date())

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

  private val sensorListener = object : SensorEventListener {
    override fun onSensorChanged(event: SensorEvent) {
      latestRawSteps = event.values[0].toInt()
      computeAndPersistTodaySteps()
    }
    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}
  }

  private fun ensureSensorRefs(context: Context) {
    if (sensorManager == null) {
      sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    }
    if (stepSensor == null) {
      stepSensor = sensorManager?.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)
    }
  }

  private fun startTrackingIfPermitted(): Boolean {
    val context = applicationContext() ?: return false
    if (!hasActivityRecognitionPermission(context)) return false
    if (isListenerRegistered) return stepSensor != null

    ensureSensorRefs(context)
    val sensor = stepSensor ?: return false

    sensorManager?.registerListener(
      sensorListener,
      sensor,
      SensorManager.SENSOR_DELAY_NORMAL
    )
    isListenerRegistered = true
    return true
  }

  private fun computeAndPersistTodaySteps(): Int {
    if (latestRawSteps < 0) return -1

    val p = prefs ?: return -1
    val today = todayDateString()
    val storedDate = p.getString("baseline_date", null)

    if (storedDate != today) {
      p.edit()
        .putString("baseline_date", today)
        .putInt("baseline_raw", latestRawSteps)
        .putInt("baseline_today_steps", 0)
        .apply()
      return 0
    }

    val baselineRaw = p.getInt("baseline_raw", -1)
    val baselineTodaySteps = p.getInt("baseline_today_steps", 0)

    if (baselineRaw < 0) {
      p.edit()
        .putString("baseline_date", today)
        .putInt("baseline_raw", latestRawSteps)
        .putInt("baseline_today_steps", 0)
        .apply()
      return 0
    }

    val todaySteps: Int
    if (latestRawSteps >= baselineRaw) {
      todaySteps = baselineTodaySteps + (latestRawSteps - baselineRaw)
    } else {
      todaySteps = baselineTodaySteps
    }

    p.edit()
      .putInt("baseline_raw", latestRawSteps)
      .putInt("baseline_today_steps", todaySteps)
      .apply()

    return todaySteps
  }

  override fun definition() = ModuleDefinition {
    Name("StepTracker")

    OnCreate {
      val context = applicationContext() ?: return@OnCreate
      prefs = context.getSharedPreferences("step_tracker_prefs", Context.MODE_PRIVATE)
      ensureSensorRefs(context)
      startTrackingIfPermitted()
    }

    OnDestroy {
      sensorManager?.unregisterListener(sensorListener)
      isListenerRegistered = false
    }

    Function("startTracking") {
      return@Function startTrackingIfPermitted()
    }

    Function("hasStepSensor") {
      val context = applicationContext() ?: return@Function false
      ensureSensorRefs(context)
      return@Function stepSensor != null
    }

    Function("getTodaySteps") {
      val p = prefs
      if (p == null) return@Function -1

      if (latestRawSteps >= 0) {
        return@Function computeAndPersistTodaySteps()
      }

      val today = todayDateString()
      val storedDate = p.getString("baseline_date", null)
      if (storedDate != today) return@Function 0
      return@Function p.getInt("baseline_today_steps", 0)
    }

    Function("getRawStepsSinceReboot") {
      return@Function latestRawSteps
    }
  }
}
