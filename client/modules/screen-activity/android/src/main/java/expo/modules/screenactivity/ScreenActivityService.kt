package expo.modules.screenactivity

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder

/**
 * Foreground service whose only job is to stay alive long enough to keep
 * ScreenEventReceiver's dynamic registration active. Without this, Android would tear the
 * registration down as soon as the app is backgrounded, and screen on/off events overnight
 * (e.g. for sleep detection) would simply stop arriving.
 *
 * Mirrors StepTrackerService's role in the step-tracker feature - same "must stay alive"
 * constraint, same foreground-service solution.
 */
class ScreenActivityService : Service() {

  private var receiver: ScreenEventReceiver? = null

  override fun onCreate() {
    super.onCreate()
    startForeground(NOTIFICATION_ID, buildNotification())
    registerScreenReceiver()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    // START_STICKY: if the system kills this service under memory pressure, it will attempt
    // to recreate it later (without redelivering the last intent). Appropriate here since this
    // service has no per-command state - onCreate alone is enough to restore full function.
    return START_STICKY
  }

  override fun onDestroy() {
    unregisterScreenReceiver()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun registerScreenReceiver() {
    if (receiver != null) return // Already registered - avoid double registration
    val r = ScreenEventReceiver()
    registerReceiver(r, ScreenEventReceiver.intentFilter())
    receiver = r
  }

  private fun unregisterScreenReceiver() {
    receiver?.let {
      try {
        unregisterReceiver(it)
      } catch (e: IllegalArgumentException) {
        // Receiver was already unregistered (e.g. onDestroy called twice) - safe to ignore.
      }
    }
    receiver = null
  }

  private fun buildNotification(): Notification {
    val channelId = ensureNotificationChannel()

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, channelId)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    return builder
      .setContentTitle("HealthApp")
      .setContentText("Tracking screen activity")
      .setSmallIcon(applicationInfo.icon)
      .setOngoing(true)
      .build()
  }

  private fun ensureNotificationChannel(): String {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      val existing = manager.getNotificationChannel(CHANNEL_ID)
      if (existing == null) {
        val channel = NotificationChannel(
          CHANNEL_ID,
          "Screen Activity Tracking",
          NotificationManager.IMPORTANCE_MIN // Silent, low-visibility - this is a background tracker, not a user-facing alert
        )
        manager.createNotificationChannel(channel)
      }
    }
    return CHANNEL_ID
  }

  companion object {
    private const val CHANNEL_ID = "screen_activity_tracking"
    private const val NOTIFICATION_ID = 9101 // Arbitrary but must be unique app-wide

    fun start(context: Context) {
      val intent = Intent(context, ScreenActivityService::class.java)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
    }

    fun stop(context: Context) {
      context.stopService(Intent(context, ScreenActivityService::class.java))
    }
  }
}