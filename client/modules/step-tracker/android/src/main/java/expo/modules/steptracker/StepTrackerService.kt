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
import android.os.Handler
import android.os.Looper
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
  private val handler = Handler(Looper.getMainLooper())

  private val periodicFlushRunnable = object : Runnable {
    override fun run() {
      if (isRunning) {
        StepTrackerEngine.flush(this@StepTrackerService)
        handler.postDelayed(this, 5 * 60 * 1000)
      }
    }
  }

  private val periodicSyncRunnable = object : Runnable {
    override fun run() {
      if (isRunning) {
        syncSystemStepCounter()
        handler.postDelayed(this, 10 * 60 * 1000)
      }
    }
  }

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

    handler.postDelayed(periodicFlushRunnable, 5 * 60 * 1000)
    handler.postDelayed(periodicSyncRunnable, 10 * 60 * 1000)
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
    handler.removeCallbacks(periodicFlushRunnable)
    handler.removeCallbacks(periodicSyncRunnable)
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

  private fun syncSystemStepCounter() {
    try {
      val rawSteps = StepCounterStore.getRawStepsSinceReboot(this)
      if (rawSteps >= 0) {
        StepTrackerEngine.syncFromSystemCounter(this, rawSteps)
        Log.d(TAG, "Synced system step counter: $rawSteps")
      }
    } catch (e: Exception) {
      Log.e(TAG, "Failed to sync system step counter", e)
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
