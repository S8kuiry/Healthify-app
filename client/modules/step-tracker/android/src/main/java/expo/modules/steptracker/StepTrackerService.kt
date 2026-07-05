package expo.modules.steptracker

import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.Build
import android.os.IBinder
import android.util.Log

class StepTrackerService : Service(), SensorEventListener {

  companion object {
    private const val TAG = "StepTrackerService"

    @Volatile
    var isRunning: Boolean = false
      private set
  }

  private lateinit var sensorManager: SensorManager
  private var stepSensor: Sensor? = null

  override fun onCreate() {
    super.onCreate()
    isRunning = true
    StepTrackerNotification.ensureChannel(this)

    // Persist any day that closed while the service was stopped; avoid flushing
    // today with 0 when prefs still point at a previous calendar day.
    StepCounterStore.flushStaleDayToDb(this)
    if (StepCounterStore.isStoredDateToday(this)) {
      StepTrackerEngine.flush(this)
    }

    sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
    stepSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)

    // Promote to foreground immediately — Android requires this within ~5s of start.
    showForegroundNotification()

    stepSensor?.let {
      sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    showForegroundNotification()
    return START_STICKY
  }

  override fun onSensorChanged(event: SensorEvent?) {
    if (event?.sensor?.type != Sensor.TYPE_STEP_COUNTER) return
    StepTrackerEngine.onSensorRaw(this, event.values[0].toInt())
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    isRunning = false
    StepTrackerEngine.flush(this)
    if (::sensorManager.isInitialized) {
      sensorManager.unregisterListener(this)
    }
    super.onDestroy()
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    super.onTaskRemoved(rootIntent)
    if (!StepCounterStore.isTrackingEnabled(this)) return
    StepTrackerServiceStarter.start(this)
  }

  private fun showForegroundNotification() {
    try {
      val steps = StepCounterStore.getTodaySteps(this)
      val calories = StepCounterStore.activeCalories(this, steps)
      val notification = StepTrackerNotification.build(this, steps, calories)
      promoteToForeground(notification)
    } catch (e: Exception) {
      Log.e(TAG, "Failed to show foreground notification", e)
    }
  }

  private fun promoteToForeground(notification: android.app.Notification) {
    val notificationId = StepTrackerNotification.notificationId()
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      startForeground(notificationId, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH)
    } else {
      startForeground(notificationId, notification)
    }
  }
}
