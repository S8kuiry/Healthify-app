package expo.modules.screenactivity

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter

/**
 * Receives screen state changes and forwards them to ScreenActivityEventDispatcher.
 *
 * IMPORTANT: This receiver must be registered dynamically via Context.registerReceiver(...)
 * at runtime - it cannot be declared in AndroidManifest.xml. Since API 26, Android does not
 * deliver SCREEN_ON / SCREEN_OFF to manifest-declared receivers at all (battery reasons - these
 * fire very frequently). ScreenActivityService owns the registration and this receiver's
 * lifecycle; do not try to register this anywhere else.
 */
class ScreenEventReceiver : BroadcastReceiver() {

  override fun onReceive(context: Context, intent: Intent) {
    val type = when (intent.action) {
      Intent.ACTION_SCREEN_ON -> "SCREEN_ON"
      
      Intent.ACTION_SCREEN_OFF -> "SCREEN_OFF"
      Intent.ACTION_USER_PRESENT -> "USER_PRESENT"
      else -> return // Ignore anything unexpected
    }

    ScreenActivityEventDispatcher.dispatch(
      ScreenEvent(type = type, timestampMs = System.currentTimeMillis())
    )
  }

  companion object {
    /**
     * Builds the IntentFilter this receiver should be registered with. Kept here (rather than
     * duplicated in the Service) so the receiver and its filter stay in sync as a single unit.
     */
    fun intentFilter(): IntentFilter {
      return IntentFilter().apply {
        addAction(Intent.ACTION_SCREEN_ON)
        addAction(Intent.ACTION_SCREEN_OFF)
        addAction(Intent.ACTION_USER_PRESENT)
      }
    }
  }
}