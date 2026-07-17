package expo.modules.screenactivity

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

object SleepReminderNotifier {
  private const val TAG = "SleepReminderNotifier"
  private const val CHANNEL_ID = "sleep_reminder"
  private const val EARLY_REMINDER_ID = 9102
  private const val FINAL_REMINDER_ID = 9103

  fun postEarlyReminder(context: Context) {
    ensureNotificationChannel(context)

    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setContentTitle("HealthApp")
      .setContentText("Hey! Wind down your activity. Sleep tracking starts in 1 hour")
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setAutoCancel(true)
      .build()

    try {
      NotificationManagerCompat.from(context).notify(EARLY_REMINDER_ID, notification)
      Log.d(TAG, "Posted early reminder notification")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to post early reminder notification", e)
    }
  }

  fun postFinalReminder(context: Context) {
    ensureNotificationChannel(context)

    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setContentTitle("HealthApp")
      .setContentText("Time to tuck in! Sleep tracking starts in 10 minutes")
      .setSmallIcon(android.R.drawable.ic_lock_idle_alarm)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setAutoCancel(true)
      .build()

    try {
      NotificationManagerCompat.from(context).notify(FINAL_REMINDER_ID, notification)
      Log.d(TAG, "Posted final reminder notification")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to post final reminder notification", e)
    }
  }

  private fun ensureNotificationChannel(context: Context) {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val existing = manager.getNotificationChannel(CHANNEL_ID)
      if (existing == null) {
        val channel = NotificationChannel(
          CHANNEL_ID,
          "Sleep Reminders",
          NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
          description = "Reminders for your sleep schedule"
          enableVibration(false)
          setSound(null, null)
        }
        manager.createNotificationChannel(channel)
      }
    }
  }
}
