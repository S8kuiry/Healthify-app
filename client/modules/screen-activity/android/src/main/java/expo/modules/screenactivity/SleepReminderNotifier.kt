package expo.modules.screenactivity

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.graphics.drawable.IconCompat
import android.app.PendingIntent
import android.content.Intent
import android.net.Uri

object SleepReminderNotifier {
  private const val TAG = "SleepReminderNotifier"
  private const val CHANNEL_ID = "sleep_reminder"
  private const val EARLY_REMINDER_ID = 9102
  private const val FINAL_REMINDER_ID = 9103

  /**
   * Resolves the app's branded notification icon (res/drawable/ic_stat_healthify) by name.
   * This module can't reference the app's R class at compile time, so we look it up at runtime.
   * Falls back to the framework alarm icon if the branded icon isn't present.
   */
  private fun smallIconResId(context: Context): Int {
    val id = context.resources.getIdentifier("ic_stat_healthify", "drawable", context.packageName)
    return if (id != 0) id else android.R.drawable.ic_lock_idle_alarm
  }

  /**
   * Builds the small (status-bar / top-left) icon. The branded PNG has heavy transparent padding
   * (for the splash), so the H looks tiny inside the small icon's circular chip. We crop the
   * transparent border so the H fills the frame. Falls back to the plain drawable resource.
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
   * Loads the full-color branded logo as a Bitmap for the notification's large icon. The large
   * icon is not tinted by Android, so it shows exactly as designed. Returns null if it can't be
   * decoded (the notification then simply shows no large icon).
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

  fun postEarlyReminder(context: Context) {
    ensureNotificationChannel(context)

    // Create the deep link intent targeting the screentime tab
    val deepLinkIntent = Intent(Intent.ACTION_VIEW, Uri.parse("client:///screentime")).apply {
        `package` = context.packageName
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }

    // Wrap it in a PendingIntent
    val pendingIntent = PendingIntent.getActivity(
        context,
        EARLY_REMINDER_ID, // Use unique request codes per notification type
        deepLinkIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setContentTitle("Healthify - Wind Down Time 🌙")
      .setContentText("Ready to disconnect? Your sleep window begins in 1 hour. Let’s prep for a great rest.")
      .setSmallIcon(smallIcon(context))
      .setLargeIcon(largeIcon(context))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setContentIntent(pendingIntent) // <--- ATTACH THE TAP ACTION HERE
      .setAutoCancel(true) // Ensures the notification disappears after the user taps it
      .setVibrate(longArrayOf(0, 150, 100))
      .build()

    try {
      NotificationManagerCompat.from(context).notify(EARLY_REMINDER_ID, notification)
      Log.d(TAG, "Posted early reminder notification")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to post early reminder notification", e)
    }
  }

  /**
   * Final reminder, fired ~10 min before the sleep window starts.
   *
   * Smart behaviour: this reminder is only useful if the user is actually still awake and using
   * the phone. We check the live screen state at the moment the alarm fires:
   *   - Screen OFF  -> the user has already put the phone down (likely settling in). We skip the
   *                    notification entirely so we don't buzz/light up a dark room.
   *   - Screen ON   -> the user is still up and on their phone. We post an assertive "time to
   *                    sleep" nudge to actually push them off the device.
   */
  fun postFinalReminder(context: Context) {
    if (!isScreenInteractive(context)) {
      Log.d(TAG, "Screen is off at final reminder time - user likely settling in, skipping reminder")
      return
    }

    ensureNotificationChannel(context)

    // --- Deep link: tapping routes to the screentime tab ---
    val deepLinkIntent = Intent(Intent.ACTION_VIEW, Uri.parse("client:///screentime")).apply {
        `package` = context.packageName
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }

    val pendingIntent = PendingIntent.getActivity(
        context,
        FINAL_REMINDER_ID, // Handled with unique final request code
        deepLinkIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setContentTitle("Healthify - Time to Sleep 🌙")
      .setContentText("You're still on your phone — sleep tracking starts in 10 minutes. Put it down and get some rest.")
      .setSmallIcon(smallIcon(context))
      .setLargeIcon(largeIcon(context))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setContentIntent(pendingIntent) // <--- ATTACH THE TAP ACTION HERE
      .setAutoCancel(true)
      .setVibrate(longArrayOf(0, 200, 100, 200))
      .build()

    try {
      NotificationManagerCompat.from(context).notify(FINAL_REMINDER_ID, notification)
      Log.d(TAG, "Screen is on - posted assertive final reminder notification")
    } catch (e: Exception) {
      Log.e(TAG, "Failed to post final reminder notification", e)
    }
  }

  /**
   * Returns true if the device screen is currently on/interactive (user is actively using it).
   * Uses PowerManager.isInteractive() which reflects the real-time screen state - no dependency
   * on whether ScreenEventReceiver captured earlier on/off events.
   */
  private fun isScreenInteractive(context: Context): Boolean {
    return try {
      val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      powerManager.isInteractive
    } catch (e: Exception) {
      // If we can't determine screen state, fail open and post the reminder anyway.
      Log.w(TAG, "Could not read screen state, defaulting to posting reminder", e)
      true
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
          NotificationManager.IMPORTANCE_HIGH
        ).apply {
          description = "Reminders for your sleep schedule with sound and vibration"
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
