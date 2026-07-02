import { PermissionsAndroid, Platform } from 'react-native';
import { EventEmitter } from 'expo-modules-core';

import StepTrackerModule from './StepTrackerModule';
import type { StepUpdateEvent } from './StepTrackerModule';

// expo-modules-core's EventEmitter typing is intentionally strict; our native module
// events are defined on the Kotlin side (`Events("onStepUpdate")`).
const emitter = new EventEmitter(StepTrackerModule as any);


export function startForegroundTracking(): boolean {

  return StepTrackerModule.startForegroundTracking();

}



export function stopForegroundTracking(): boolean {

  return StepTrackerModule.stopForegroundTracking();

}



export function setProfileMetrics(heightCm: number, weightKg: number): boolean {

  return StepTrackerModule.setProfileMetrics(heightCm, weightKg);

}

export function setActivityProfile(
  heightCm: number,
  weightKg: number,
  stepGoal: number,
  calorieGoal: number
): boolean {
  return StepTrackerModule.setActivityProfile(heightCm, weightKg, stepGoal, calorieGoal);
}

export function addStepUpdateListener(listener: (event: StepUpdateEvent) => void) {
  return (emitter as any).addListener('onStepUpdate', listener) as { remove: () => void };
}



export function getTodaySteps(): number {

  const raw = StepTrackerModule.getTodaySteps();

  return raw < 0 ? 0 : raw;

}



export function getTodayStepsRaw(): number {

  return StepTrackerModule.getTodaySteps();

}



export function getRawStepsSinceReboot(): number {

  return StepTrackerModule.getRawStepsSinceReboot();

}



export function hasStepSensor(): boolean {

  return StepTrackerModule.hasStepSensor();

}



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
  const granted = await requestStepPermission();
  if (!granted) return false;
  return startForegroundTracking();
}


