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