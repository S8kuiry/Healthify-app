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

        // 1. Kickstart audio/vibe manager background sequence loop
        val serviceIntent = Intent(context, AlarmService::class.java).apply {
            putExtra("REMINDER_ID", id)
            putExtra("REMINDER_LABEL", label)
        }
        ContextCompat.startForegroundService(context, serviceIntent)

        // 2. Project full screen UI view on top of screen locks safely
        val activityIntent = Intent(context, AlarmActivity::class.java).apply {
            putExtra("REMINDER_ID", id)
            putExtra("REMINDER_LABEL", label)
            putExtra("TIMESTAMP", timestamp)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        context.startActivity(activityIntent)
    }
}