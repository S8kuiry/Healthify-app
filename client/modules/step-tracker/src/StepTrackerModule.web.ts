import { registerWebModule, NativeModule } from 'expo';

class StepTrackerModule extends NativeModule<{}> {}

export default registerWebModule(StepTrackerModule, 'StepTrackerModule');
