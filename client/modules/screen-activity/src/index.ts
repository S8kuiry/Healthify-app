import { requireNativeModule } from 'expo-modules-core';
import type { EventSubscription } from 'expo-modules-core';

/**
 * Raw event shape delivered from the native side (see ScreenActivityEventDispatcher.kt /
 * ScreenActivityModule.kt). timestampMs arrives as a JS number - safe up to ~285,000 years
 * of milliseconds, well beyond any real timestamp.
 */
export type ScreenEventType = 'SCREEN_ON' | 'SCREEN_OFF' | 'USER_PRESENT';

export interface ScreenEvent {
  type: ScreenEventType;
  timestampMs: number;
}

interface ScreenActivityNativeModule {
  startTracking(): Promise<void>;
  stopTracking(): Promise<void>;
  isTracking(): Promise<boolean>;
  scheduleSleepTracking(): Promise<void>;
  cancelSleepTracking(): Promise<void>;
  debugRunSleepWindow(startInMinutes: number, lengthMinutes: number): Promise<void>;
  hasUsageAccessPermission(): Promise<boolean>;
  openUsageAccessSettings(): Promise<void>;
  addListener(eventName: 'onScreenEvent', listener: (event: ScreenEvent) => void): EventSubscription;
}

const ScreenActivityModule = requireNativeModule<ScreenActivityNativeModule>('ScreenActivity');

/**
 * Starts the foreground service that keeps screen on/off detection alive, even while the
 * app is backgrounded. Safe to call if already tracking - the native side no-ops in that case.
 */
export function startTracking(): Promise<void> {
  return ScreenActivityModule.startTracking();
}

/**
 * Stops the foreground service. After this, screen events will no longer be captured until
 * startTracking() is called again.
 */
export function stopTracking(): Promise<void> {
  return ScreenActivityModule.stopTracking();
}

/**
 * Returns whether a JS listener is currently attached and actively receiving events. This is
 * a proxy for "are we forwarding events right now," not whether the foreground service
 * process itself is alive.
 */
export function isTracking(): Promise<boolean> {
  return ScreenActivityModule.isTracking();
}

/**
 * Checks whether the user has granted Usage Access (needed later for the per-app usage
 * breakdown). This is a special-access permission, not a normal runtime permission - it
 * cannot be requested via a dialog.
 */
export function hasUsageAccessPermission(): Promise<boolean> {
  return ScreenActivityModule.hasUsageAccessPermission();
}

/**
 * Opens the system Settings screen where the user can manually grant Usage Access.
 */
export function openUsageAccessSettings(): Promise<void> {
  return ScreenActivityModule.openUsageAccessSettings();
}

/**
 * Schedules all sleep-tracking alarms (early reminder, final reminder, start, stop) based on
 * the current sleep window from sleep_settings. Called on app startup and whenever sleep
 * settings change. Native reads sleep_settings directly - no parameters needed.
 */
export function scheduleSleepTracking(): Promise<void> {
  return ScreenActivityModule.scheduleSleepTracking();
}

/**
 * Cancels all sleep-tracking alarms. Called when the user disables sleep tracking or updates
 * settings.
 */
export function cancelSleepTracking(): Promise<void> {
  return ScreenActivityModule.cancelSleepTracking();
}

/**
 * TEST HELPER. Arms a compressed sleep window - starting `startInMinutes` from now and
 * lasting `lengthMinutes` - so the full start -> track -> finalize -> wake-up notification
 * -> summary card cycle can be verified in minutes instead of waiting for real bedtime.
 *
 * It runs the same native alarm/service path as a real window, so what you observe here is
 * what happens overnight. Call scheduleSleepTracking() afterwards to restore the real window.
 *
 * Example: debugRunSleepWindow(2, 3) - window opens in 2 min, closes 3 min later, and the
 * summary notification fires ~1 min after that.
 */
export function debugRunSleepWindow(
  startInMinutes: number,
  lengthMinutes: number
): Promise<void> {
  return ScreenActivityModule.debugRunSleepWindow(startInMinutes, lengthMinutes);
}

/**
 * Subscribes to live screen on/off/unlock events. Remove the subscription (e.g. in a
 * useEffect cleanup) via subscription.remove() to avoid leaking listeners.
 *
 * Note: attaching a listener also determines whether the native side forwards events at all
 * (see OnStartObserving/OnStopObserving in ScreenActivityModule.kt) - if nothing is
 * subscribed, events are still captured by the receiver but simply not bridged to JS.
 */
export function addScreenEventListener(
  listener: (event: ScreenEvent) => void
): EventSubscription {
  return ScreenActivityModule.addListener('onScreenEvent', listener);
}

export default ScreenActivityModule;