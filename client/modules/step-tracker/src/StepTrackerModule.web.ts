import { registerWebModule, NativeModule } from 'expo';

class StepTrackerModule extends NativeModule<{}> {
  // Web does not support step tracking; provide safe no-op APIs.
  getTodaySteps(): number {
    return 0;
  }
  getRawStepsSinceReboot(): number {
    return -1;
  }
  hasStepSensor(): boolean {
    return false;
  }
  setProfileMetrics(_heightCm: number, _weightKg: number): boolean {
    return false;
  }
  setActivityProfile(_heightCm: number, _weightKg: number, _stepGoal: number, _calorieGoal: number): boolean {
    return false;
  }
  startForegroundTracking(): boolean {
    return false;
  }
  stopForegroundTracking(): boolean {
    return false;
  }
}

export default registerWebModule(StepTrackerModule, 'StepTrackerModule');
