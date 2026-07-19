package expo.modules.screenactivity

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.graphics.drawable.IconCompat

object SleepSummaryNotifier {
  private const val TAG = "SleepSummaryNotifier"
  private const val CHANNEL_ID = "sleep_summary"
  private const val NOTIFICATION_ID = 9104

  /**
   * Resolves the app's branded notification icon (res/drawable/ic_stat_healthify) by name.
   * These notifiers live in a separate module and can't reference the app's R class at compile
   * time, so we look the drawable up at runtime. Falls back to the framework alarm icon if the
   * branded icon isn't found (e.g. before the asset is added).
   */
  private fun smallIconResId(context: Context): Int {
    val id = context.resources.getIdentifier("ic_stat_healthify", "drawable", context.packageName)
    return if (id != 0) id else android.R.drawable.ic_lock_idle_alarm
  }

  /**
   * Builds the small (status-bar / top-left) icon. The branded PNG has heavy transparent padding
   * (needed for the splash), so as a plain drawable the H looks tiny inside the small icon's
   * circular chip. We crop the transparent border so the H fills the frame. Falls back to the
   * plain drawable resource if the bitmap can't be built.
   */
  private fun smallIcon(context: Context): IconCompat {
    return try {
      val id = context.resources.getIdentifier("ic_stat_healthify", "drawable", context.packageName)
      if (id == 0) return IconCompat.createWithResource(context, smallIconResId(context))
      val full = BitmapFactory.decodeResource(context.resources, id)
        ?: return IconCompat.createWithResource(context, id)
      IconCompat.createWithBitmap(NotificationIconUtil.cropTransparentBorder(full))
    } catch (e: Exception) {
      Log.w(TAG, "Could not build small icon, using plain resource", e)
      IconCompat.createWithResource(context, smallIconResId(context))
    }
  }

  /**
   * Loads the full-color branded logo as a Bitmap for the notification's large icon. Unlike the
   * small (status-bar) icon, the large icon is NOT tinted by Android - it shows exactly as
   * designed, in full color, on the right of the expanded notification. Returns null if the
   * asset can't be decoded (the notification then simply shows no large icon).
   */
  private fun largeIcon(context: Context): Bitmap? {
    return try {
      val id = context.resources.getIdentifier("ic_stat_healthify", "drawable", context.packageName)
      if (id != 0) BitmapFactory.decodeResource(context.resources, id) else null
    } catch (e: Exception) {
      Log.w(TAG, "Could not load large icon bitmap", e)
      null
    }
  }

  fun postSleepSummary(context: Context, durationMinutes: Int) {
    ensureNotificationChannel(context)

    val hours = durationMinutes / 60
    val minutes = durationMinutes % 60
    val durationText = if (minutes == 0) "${hours}h" else "${hours}h ${minutes}m"


    // --- CHANGE 1: Personalized & Warm Notification Content Strings ---
    val titleText = "Good morning! ☀️"
    val contentText = "Your sleep summary is ready ($durationText). Tap to check out your recovery score last night."

    // --- Deep link: tapping routes to the screentime tab ---
    val deepLinkIntent = Intent(Intent.ACTION_VIEW, Uri.parse("client:///screentime")).apply {
      `package` = context.packageName
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }

    val pendingIntent = PendingIntent.getActivity(
      context,
      NOTIFICATION_ID,
      deepLinkIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setContentTitle(titleText)
      .setContentText(contentText)
      .setSmallIcon(smallIcon(context))
      .setLargeIcon(largeIcon(context))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setContentIntent(pendingIntent)
      .setAutoCancel(true)
      .setVibrate(longArrayOf(0, 200, 100, 200))
      .build()

    try {
      NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
      Log.d(TAG, "Posted sleep summary notification: $contentText")
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
