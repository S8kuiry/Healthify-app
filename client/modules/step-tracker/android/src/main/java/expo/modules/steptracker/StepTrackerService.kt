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

class StepTrackerService : Service(), SensorEventListener {

  private lateinit var sensorManager: SensorManager
  private var stepSensor: Sensor? = null

  override fun onCreate() {
    super.onCreate()
    StepTrackerNotification.ensureChannel(this)
    sensorManager = getSystemService(Context.SENSOR_SERVICE) as SensorManager
    stepSensor = sensorManager.getDefaultSensor(Sensor.TYPE_STEP_COUNTER)

    stepSensor?.let {
      sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val steps = StepCounterStore.getTodaySteps(this)
    val calories = StepCounterStore.activeCalories(this, steps)
    val notification = StepTrackerNotification.build(this, steps, calories)
    promoteToForeground(notification)
    return START_STICKY
  }

  override fun onSensorChanged(event: SensorEvent?) {
    if (event?.sensor?.type != Sensor.TYPE_STEP_COUNTER) return
    StepTrackerEngine.onSensorRaw(this, event.values[0].toInt())
  }

  override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onDestroy() {
    StepTrackerEngine.flush(this)
    sensorManager.unregisterListener(this)
    super.onDestroy()
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