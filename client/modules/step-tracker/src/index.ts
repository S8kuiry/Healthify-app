import { PermissionsAndroid, Platform } from 'react-native';
import StepTrackerModule from './StepTrackerModule';

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

export async function requestStepPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  if (typeof Platform.Version === 'number' && Platform.Version < 29) {
    StepTrackerModule.startTracking();
    return true;
  }

  const alreadyGranted = await PermissionsAndroid.check(
    PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION
  );
  if (alreadyGranted) {
    StepTrackerModule.startTracking();
    return true;
  }

  const result = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACTIVITY_RECOGNITION,
    {
      title: 'Physical activity permission',
      message: 'HealthApp needs access to your physical activity to count steps.',
      buttonPositive: 'Allow',
    }
  );

  if (result === PermissionsAndroid.RESULTS.GRANTED) {
    StepTrackerModule.startTracking();
    return true;
  }

  return false;
}
