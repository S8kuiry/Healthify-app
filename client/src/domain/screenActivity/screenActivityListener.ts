import { scheduleSleepTracking, type ScreenEvent } from '../../../modules/screen-activity/src';
import { pruneOldScreenData } from './screenActivityRepo';
import type { EventSubscription } from 'expo-modules-core';

/**
 * Schedules sleep-tracking alarms based on the current sleep window. Call once
 * on app startup (e.g. from your root layout / app entry). Also prunes old data
 * to keep database size under control.
 *
 * Native foreground service runs only during the sleep window, entirely headless.
 * No app open required, ever.
 */
export async function initScreenActivityTracking(): Promise<void> {
  try {
    // Prune old data and clean up orphaned sessions from previous runs
    await pruneOldScreenData();
  } catch (err) {
    console.warn('[ScreenActivityListener] Failed to prune old screen data:', err);
  }

  try {
    await scheduleSleepTracking();
  } catch (err) {
    console.warn('[ScreenActivityListener] Failed to schedule sleep tracking:', err);
  }
}