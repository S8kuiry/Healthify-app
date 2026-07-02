import { NativeModule, requireNativeModule } from 'expo';

export type StepUpdateEvent = {
  steps: number;
  calories: number;
  date: string; // YYYY-MM-DD
};

type StepTrackerModule = NativeModule<{ onStepUpdate: (event: StepUpdateEvent) => void }> & {
  getTodaySteps(): number;
  getRawStepsSinceReboot(): number;
  hasStepSensor(): boolean;
  setProfileMetrics(heightCm: number, weightKg: number): boolean;
  setActivityProfile(heightCm: number, weightKg: number, stepGoal: number, calorieGoal: number): boolean;
  startForegroundTracking(): boolean;
  stopForegroundTracking(): boolean;
};

export default requireNativeModule<StepTrackerModule>('StepTracker');
