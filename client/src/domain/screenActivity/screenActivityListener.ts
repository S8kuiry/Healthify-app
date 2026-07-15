import { addScreenEventListener, startTracking, type ScreenEvent } from '../../../modules/screen-activity/src';
import { openSession, closeSession, getOpenSession } from './screenActivityRepo';
import type { EventSubscription } from 'expo-modules-core';

let subscription: EventSubscription | null = null;
let openSessionId: string | null = null;

/**
 * Turns a raw native ScreenEvent into a repo call. Exported separately from
 * the listener wiring so it's independently unit-testable without needing
 * the native module involved at all - matches how reminderParser.ts's core
 * logic is kept separate from its I/O.
 */
export async function handleScreenEvent(event: ScreenEvent): Promise<void> {
  const timestampIso = new Date(event.timestampMs).toISOString();

  if (event.type === 'SCREEN_ON') {
    // Guard against a duplicate SCREEN_ON with no SCREEN_OFF in between
    // (can happen if USER_PRESENT and SCREEN_ON both land while a session
    // is already open) - don't open a second session on top of one already
    // running.
    if (openSessionId !== null) return;
    openSessionId = await openSession(timestampIso);
    return;
  }

  if (event.type === 'SCREEN_OFF') {
    if (openSessionId === null) return; // Nothing open - stray/duplicate event, ignore
    await closeSession(openSessionId, timestampIso);
    openSessionId = null;
    return;
  }

  // USER_PRESENT: not used for session open/close (SCREEN_ON already covers
  // "phone became active"). Reserved for a future distinction between
  // "screen woke up" vs "user actually unlocked it," per the original
  // Screen Activity plan - no-op for now.
}

/**
 * Starts the native foreground service and attaches the JS listener that
 * feeds handleScreenEvent. Call once on app startup (e.g. from your root
 * layout / app entry), not per-screen - this should run for the lifetime of
 * the app.
 *
 * Recovers any session left open from a previous run (e.g. app process was
 * killed mid-session) by treating app startup itself as an implicit
 * SCREEN_OFF at the current time, so screen_sessions never accumulates a
 * permanently-open orphaned row.
 */
export async function initScreenActivityTracking(): Promise<void> {
  if (subscription !== null) return; // Already initialized

  const orphaned = await getOpenSession();
  if (orphaned !== null) {
    await closeSession(orphaned.id, new Date().toISOString());
  }
  openSessionId = null;

  await startTracking();
  subscription = addScreenEventListener((event) => {
    void handleScreenEvent(event);
  });
}

/**
 * Tears down the listener. Rarely needed in practice (this is meant to run
 * for the app's lifetime) but useful for tests or a full teardown path.
 */
export function stopScreenActivityTracking(): void {
  subscription?.remove();
  subscription = null;
}