import { AppState, PermissionsAndroid, Platform } from 'react-native';
import { EventEmitter } from 'expo-modules-core';

import { getStepTrackerModule, isStepTrackerNativeAvailable } from './StepTrackerModule';
import type { StepUpdateEvent } from './StepTrackerModule';

let emitter: InstanceType<typeof EventEmitter> | undefined;

function module() {
  return getStepTrackerModule();
}

function getEmitter() {
  if (!emitter) {
    emitter = new EventEmitter(module() as any);
  }
  return emitter;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Wait until the app is in foreground and the permission UI has fully dismissed. */
async function waitUntilAppIsActive(): Promise<void> {
  const settle = () => delay(700);

  if (AppState.currentState === 'active') {
    await settle();
    return;
  }

  await new Promise<void>((resolve) => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        sub.remove();
        void settle().then(resolve);
      }
    });
  });
}

export function startForegroundTracking(): boolean {
  if (module().isForegroundTrackingRunning()) {
    return true;
  }
  return module().startForegroundTracking();
}

export function isForegroundTrackingRunning(): boolean {
  return module().isForegroundTrackingRunning();
}

export function stopForegroundTracking(): boolean {
  return module().stopForegroundTracking();
}

export function setProfileMetrics(heightCm: number, weightKg: number): boolean {
  return module().setProfileMetrics(heightCm, weightKg);
}

export function setActivityProfile(
  heightCm: number,
  weightKg: number,
  stepGoal: number,
  calorieGoal: number
): boolean {
  return module().setActivityProfile(heightCm, weightKg, stepGoal, calorieGoal);
}

export function addStepUpdateListener(listener: (event: StepUpdateEvent) => void) {
  return (getEmitter() as any).addListener('onStepUpdate', listener) as { remove: () => void };
}

export function getTodaySteps(): number {
  const raw = module().getTodaySteps();
  return raw < 0 ? 0 : raw;
}

export function getTodayStepsRaw(): number {
  return module().getTodaySteps();
}

export function getRawStepsSinceReboot(): number {
  return module().getRawStepsSinceReboot();
}

export function hasStepSensor(): boolean {
  return module().hasStepSensor();
}

export { isStepTrackerNativeAvailable };

async function requestNotificationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (typeof Platform.Version === 'number' && Platform.Version < 33) return true;

  const alreadyGranted = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
  );
  if (alreadyGranted) return true;

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
    {
      title: 'Notification permission',
      message: 'HealthApp shows your live step count while tracking in the background.',
      buttonPositive: 'Allow',
    }
  );

  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function requestStepPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  if (typeof Platform.Version === 'number' && Platform.Version < 29) {
    return requestNotificationPermission();
  }

  const activityGranted = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION
  );

  let hasActivity = activityGranted;
  if (!activityGranted) {
    const result = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
      {
        title: 'Physical activity permission',
        message: 'HealthApp needs access to your physical activity to count steps.',
        buttonPositive: 'Allow',
      }
    );
    hasActivity = result === PermissionsAndroid.RESULTS.GRANTED;
  }

  if (!hasActivity) return false;
  return requestNotificationPermission();
}

/** Single entrypoint used by the app root for Android tracking. */
export async function initStepTracking(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (!isStepTrackerNativeAvailable()) return false;

  const granted = await requestStepPermission();
  if (!granted) return false;

  // Starting the foreground service immediately after the permission dialog closes
  // crashes on Android 12–14 (ForegroundServiceStartNotAllowedException). Wait
  // until the app is fully active again before starting the service.
  await waitUntilAppIsActive();

  if (isForegroundTrackingRunning()) {
    return true;
  }

  return startForegroundTracking();
}
