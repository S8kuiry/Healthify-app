package expo.modules.screenactivity

/**
 * Represents a single screen state change captured by ScreenEventReceiver.
 *
 * type:
 *   "SCREEN_ON"    - device woke up / screen turned on
 *   "SCREEN_OFF"   - screen turned off
 *   "USER_PRESENT" - device was unlocked (fires shortly after SCREEN_ON when a lock screen is present)
 *
 * timestampMs: System.currentTimeMillis() at the moment the event was received.
 */
data class ScreenEvent(
  val type: String,
  val timestampMs: Long
)

/**
 * Singleton bus that decouples the BroadcastReceiver (which has no direct reference to the
 * Expo module) from the Module itself. The Service registers a listener here on start; the
 * Receiver pushes events here whenever Android delivers a screen intent; the Module (if it
 * has an active JS listener) forwards events out to React Native.
 *
 * This mirrors StepTrackerEventDispatcher's role in the step-tracker feature.
 */
object ScreenActivityEventDispatcher {

  private var listener: ((ScreenEvent) -> Unit)? = null

  /**
   * Called by ScreenActivityModule when a JS-side listener is registered (i.e. the app is
   * actively listening for screen events). Only one listener is supported at a time, which
   * matches how a single JS module instance will use this.
   */
  fun setListener(onEvent: ((ScreenEvent) -> Unit)?) {
    listener = onEvent
  }

  /**
   * Called by ScreenEventReceiver whenever a screen intent is received. Safe to call even if
   * no listener is currently registered (e.g. module not yet initialized) - the event is
   * simply dropped in that case, since persistence is handled separately by whichever store
   * consumes these events (added in a later phase).
   */
  fun dispatch(event: ScreenEvent) {
    listener?.invoke(event)
  }

  fun hasListener(): Boolean = listener != null
}