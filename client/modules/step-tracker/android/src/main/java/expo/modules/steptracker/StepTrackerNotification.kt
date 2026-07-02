package expo.modules.steptracker

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import java.text.NumberFormat
import java.util.Locale

object StepTrackerNotification {
  private const val CHANNEL_ID = "step_tracker_telemetry_channel"
  private const val NOTIFICATION_ID = 9912
  private val numberFormat = NumberFormat.getIntegerInstance(Locale.getDefault())

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

    val channel = NotificationChannel(
      CHANNEL_ID,
      "Kinetic Telemetry Engine",
      NotificationManager.IMPORTANCE_LOW
    )
    channel.setShowBadge(false)
    val manager = context.getSystemService(NotificationManager::class.java)
    manager?.createNotificationChannel(channel)
  }

  fun build(context: Context, steps: Int, calories: Int): Notification {
    val stepsText = numberFormat.format(steps)
    val caloriesText = numberFormat.format(calories)

    return NotificationCompat.Builder(context, CHANNEL_ID)
      .setContentTitle("Healthify — $stepsText steps")
      .setContentText("$caloriesText kcal burned today")
      .setSmallIcon(context.applicationInfo.icon)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(NotificationCompat.CATEGORY_SERVICE)
      .build()
  }

  fun refresh(context: Context) {
    ensureChannel(context)
    val steps = StepCounterStore.getTodaySteps(context)
    val calories = StepCounterStore.activeCalories(context, steps)
    val notification = build(context, steps, calories)
    val manager = context.getSystemService(NotificationManager::class.java)
    manager?.notify(NOTIFICATION_ID, notification)
  }

  fun notificationId(): Int = NOTIFICATION_ID
}
