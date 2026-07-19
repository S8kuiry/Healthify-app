package expo.modules.steptracker

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import androidx.core.app.NotificationCompat
import java.text.NumberFormat
import java.util.Locale
import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.core.graphics.drawable.IconCompat

object StepTrackerNotification {
  private const val CHANNEL_ID = "step_tracker_telemetry_channel"
  private const val NOTIFICATION_ID = 9912
  private val numberFormat = NumberFormat.getIntegerInstance(Locale.getDefault())

  /**
   * Resolves the app's branded notification icon (res/drawable/ic_stat_healthify) by name.
   * This module can't reference the app's R class at compile time, so we look it up at runtime.
   * Falls back to the app's launcher icon if the branded icon isn't present.
   */
  private fun smallIconResId(context: Context): Int {
    val id = context.resources.getIdentifier("ic_stat_healthify", "drawable", context.packageName)
    return if (id != 0) id else context.applicationInfo.icon
  }

  /**
   * Builds the small (status-bar / top-left) icon. The branded PNG has heavy transparent padding
   * (needed for the splash), so as a plain drawable the H looks tiny inside the small icon's
   * circular chip. We decode it, crop the transparent border so the H fills the frame, and return
   * it as an IconCompat. Falls back to the plain drawable resource if the bitmap can't be built.
   */
  private fun smallIcon(context: Context): IconCompat {
    return try {
      val id = context.resources.getIdentifier("ic_stat_healthify", "drawable", context.packageName)
      if (id == 0) return IconCompat.createWithResource(context, smallIconResId(context))
      val full = BitmapFactory.decodeResource(context.resources, id)
        ?: return IconCompat.createWithResource(context, id)
      IconCompat.createWithBitmap(cropTransparentBorder(full))
    } catch (e: Exception) {
      Log.w("StepTrackerNotification", "Could not build small icon, using plain resource", e)
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
      Log.w("StepTrackerNotification", "Could not load large icon bitmap", e)
      null
    }
  }

  /**
   * Crops the transparent border around the visible artwork so it fills more of the frame.
   * Scans for the bounding box of pixels with alpha above a threshold, then returns a square
   * crop (with a small padding margin) centered on that box. Falls back to the original bitmap
   * if anything is off (fully transparent, etc.).
   */
  private fun cropTransparentBorder(src: Bitmap): Bitmap {
    val w = src.width
    val h = src.height
    if (w == 0 || h == 0) return src

    var minX = w
    var minY = h
    var maxX = -1
    var maxY = -1
    val alphaThreshold = 16 // ignore near-transparent antialiasing pixels

    val row = IntArray(w)
    for (y in 0 until h) {
      src.getPixels(row, 0, w, 0, y, w, 1)
      for (x in 0 until w) {
        val alpha = (row[x] ushr 24) and 0xFF
        if (alpha > alphaThreshold) {
          if (x < minX) minX = x
          if (x > maxX) maxX = x
          if (y < minY) minY = y
          if (y > maxY) maxY = y
        }
      }
    }

    // Nothing visible found — return original untouched.
    if (maxX < minX || maxY < minY) return src

    val contentW = maxX - minX + 1
    val contentH = maxY - minY + 1
    // Small margin (~12% of the larger content dimension) so the logo isn't edge-to-edge.
    val margin = (maxOf(contentW, contentH) * 0.12f).toInt()
    // Make it square so the notification circle mask crops evenly.
    val side = maxOf(contentW, contentH) + margin * 2
    val cx = minX + contentW / 2
    val cy = minY + contentH / 2
    var left = cx - side / 2
    var top = cy - side / 2
    // Clamp to bitmap bounds.
    if (left < 0) left = 0
    if (top < 0) top = 0
    val cropSide = minOf(side, w - left, h - top)
    if (cropSide <= 0) return src

    return Bitmap.createBitmap(src, left, top, cropSide, cropSide)
  }

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

    // Create the deep link intent targeting the dashboard tab
    val deepLinkIntent = Intent(Intent.ACTION_VIEW, Uri.parse("client:///dashboard")).apply {
        `package` = context.packageName
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }

    // Wrap it in a PendingIntent
    val pendingIntent = PendingIntent.getActivity(
        context,
        NOTIFICATION_ID,
        deepLinkIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    return NotificationCompat.Builder(context, CHANNEL_ID)
      .setContentTitle("Healthify — $stepsText steps")
      .setContentText("$caloriesText kcal burned today")
      .setSmallIcon(smallIcon(context))
      .setLargeIcon(largeIcon(context))
      // note: setSmallIcon(IconCompat) requires NotificationCompat (already used here)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(pendingIntent) // <--- ATTACH THE TAP ACTION HERE
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
