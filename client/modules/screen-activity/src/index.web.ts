import type { EventSubscription } from 'expo-modules-core';

export type ScreenEventType = 'SCREEN_ON' | 'SCREEN_OFF' | 'USER_PRESENT';

export interface ScreenEvent {
  type: ScreenEventType;
  timestampMs: number;
}

// Web stubs - screen activity tracking is Android-only
export function startTracking(): Promise<void> {
  return Promise.resolve();
}

export function stopTracking(): Promise<void> {
  return Promise.resolve();
}

export function isTracking(): Promise<boolean> {
  return Promise.resolve(false);
}

export function scheduleSleepTracking(): Promise<void> {
  return Promise.resolve();
}

export function cancelSleepTracking(): Promise<void> {
  return Promise.resolve();
}

export function hasUsageAccessPermission(): Promise<boolean> {
  return Promise.resolve(false);
}

export function openUsageAccessSettings(): Promise<void> {
  return Promise.resolve();
}

export function addScreenEventListener(
  _listener: (event: ScreenEvent) => void
): EventSubscription {
  return {
    remove: () => {
      // no-op
    },
  };
}

export default {};
