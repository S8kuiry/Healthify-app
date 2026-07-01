import { NativeModule, requireNativeModule } from 'expo';

declare class StepTrackerModule extends NativeModule<{}> {
  getTodaySteps(): number;
  getRawStepsSinceReboot(): number;
  startTracking(): boolean;
  hasStepSensor(): boolean;
}

export default requireNativeModule<StepTrackerModule>('StepTracker');
