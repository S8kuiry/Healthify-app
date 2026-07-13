package expo.modules.reminderalarm

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat

class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra("REMINDER_ID") ?: return
        val label = intent.getStringExtra("REMINDER_LABEL") ?: "Reminder Alert"
        val timestamp = intent.getLongExtra("TIMESTAMP", 0L)
        val repeat = intent.getBooleanExtra("REPEAT", false)

        // 1. Kickstart the foreground service — it plays the alarm audio AND posts the
        //    full-screen-intent notification that reliably launches AlarmActivity from
        //    the background / lock screen (see AlarmService).
        val serviceIntent = Intent(context, AlarmService::class.java).apply {
            putExtra("REMINDER_ID", id)
            putExtra("REMINDER_LABEL", label)
            putExtra("TIMESTAMP", timestamp)
            putExtra("REPEAT", repeat)
        }
        ContextCompat.startForegroundService(context, serviceIntent)

        // 2. Best-effort direct launch: only succeeds when the app is already in the
        //    foreground. Background activity launches are blocked on Android 10+, where
        //    the full-screen intent above is what actually shows the screen.
        val activityIntent = Intent(context, AlarmActivity::class.java).apply {
            putExtra("REMINDER_ID", id)
            putExtra("REMINDER_LABEL", label)
            putExtra("TIMESTAMP", timestamp)
            putExtra("REPEAT", repeat)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        try {
            context.startActivity(activityIntent)
        } catch (_: Exception) {
            // Blocked in the background — expected; the full-screen intent handles it.
        }
    }
}