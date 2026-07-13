package expo.modules.reminderalarm

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Settings

object AlarmScheduler {
    private const val FLAGS = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

    fun schedule(context: Context, id: String, label: String, timestampMs: Long, repeat: Boolean = false) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

        // Handle Android 12+ API exact alarm runtime capabilities checks
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
            val intent = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM)
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            return
        }

        val intent = Intent(context, AlarmReceiver::class.java).apply {
            putExtra("REMINDER_ID", id)
            putExtra("REMINDER_LABEL", label)
            putExtra("TIMESTAMP", timestampMs)
            // Whether this alarm re-arms itself for the next day after dismissal.
            // Only daily reminders repeat; one-off ("Once") alarms must not.
            putExtra("REPEAT", repeat)
        }

        val pendingIntent = PendingIntent.getBroadcast(context, id.hashCode(), intent, FLAGS)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, timestampMs, pendingIntent)
        } else {
            alarmManager.setExact(AlarmManager.RTC_WAKEUP, timestampMs, pendingIntent)
        }
    }

    fun cancel(context: Context, id: String) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

        // Rebuild the SAME PendingIntent (same request code + component) rather than
        // looking it up with FLAG_NO_CREATE. FLAG_NO_CREATE returns null when no
        // cached instance is found — which happens after a fresh APK install / process
        // restart, since the in-memory PendingIntent is gone even though the OS still
        // holds the scheduled alarm. That null silently skipped the cancel and left the
        // alarm to fire after deletion. Recreating it with FLAG_UPDATE_CURRENT (matching
        // schedule()) always yields a token that cancels the underlying OS alarm.
        val intent = Intent(context, AlarmReceiver::class.java)
        val pendingIntent = PendingIntent.getBroadcast(context, id.hashCode(), intent, FLAGS)

        alarmManager.cancel(pendingIntent)
        pendingIntent.cancel()
    }
}