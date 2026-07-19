package expo.modules.screenactivity

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

object SleepSummaryNotifier {
  private const val TAG = "SleepSummaryNotifier"
  private const val CHANNEL_ID = "sleep_summary"
  private const val NOTIFICATION_ID = 9104

  fun postSleepSummary(context: Context, durationMinutes: Int) {
    ensureNotificationChannel(context)

    val hours = durationMinutes / 60
    val minutes = durationMinutes % 60
    val durationText = if (minutes == 0) "${hours}h" else "${hours}h ${minutes}m"
    val text = "Sleep detected: $durationText"

    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setContentTitle("HealthApp")
      .setContentText(text)
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setAutoCancel(true)
      .setVibrate(longArrayOf(0, 200, 100, 200))
      .build()

    try {
      NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
      Log.d(TAG, "Posted sleep summary notification: $text")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to post sleep summary notification", e)
    }
  }

  private fun ensureNotificationChannel(context: Context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val existing = manager.getNotificationChannel(CHANNEL_ID)
      if (existing == null) {
        val channel = NotificationChannel(
          CHANNEL_ID,
          "Sleep Summary",
          NotificationManager.IMPORTANCE_HIGH
        ).apply {
          description = "Sleep tracking wake-up notifications with sound and vibration"
          enableVibration(true)
          setSound(
            android.media.RingtoneManager.getDefaultUri(android.media.RingtoneManager.TYPE_NOTIFICATION),
            android.media.AudioAttributes.Builder()
              .setUsage(android.media.AudioAttributes.USAGE_NOTIFICATION)
              .build()
          )
        }
        manager.createNotificationChannel(channel)
      }
    }
  }
}
