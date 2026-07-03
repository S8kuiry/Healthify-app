import { NativeModule, requireOptionalNativeModule } from 'expo-modules-core';

export type StepUpdateEvent = {
  steps: number;
  calories: number;
  date: string; // YYYY-MM-DD
};

type StepTrackerNativeModule = NativeModule<{ onStepUpdate: (event: StepUpdateEvent) => void }> & {
  getTodaySteps(): number;
  getRawStepsSinceReboot(): number;
  hasStepSensor(): boolean;
  setProfileMetrics(heightCm: number, weightKg: number): boolean;
  setActivityProfile(heightCm: number, weightKg: number, stepGoal: number, calorieGoal: number): boolean;
  startForegroundTracking(): boolean;
  stopForegroundTracking(): boolean;
  isForegroundTrackingRunning(): boolean;
};

const unavailableModule = {
  getTodaySteps: () => -1,
  getRawStepsSinceReboot: () => -1,
  hasStepSensor: () => false,
  setProfileMetrics: () => false,
  setActivityProfile: () => false,
  startForegroundTracking: () => false,
  stopForegroundTracking: () => false,
  isForegroundTrackingRunning: () => false,
} as unknown as StepTrackerNativeModule;

let cachedModule: StepTrackerNativeModule | undefined;
let nativeAvailable = false;

export function getStepTrackerModule(): StepTrackerNativeModule {
  if (!cachedModule) {
    const native = requireOptionalNativeModule<StepTrackerNativeModule>('StepTracker');
    if (native) {
      cachedModule = native;
      nativeAvailable = true;
    } else {
      cachedModule = unavailableModule;
      nativeAvailable = false;
    }
  }
  return cachedModule;
}

export function isStepTrackerNativeAvailable(): boolean {
  getStepTrackerModule();
  return nativeAvailable;
}
