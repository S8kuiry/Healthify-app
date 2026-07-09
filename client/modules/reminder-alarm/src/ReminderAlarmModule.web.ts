import { registerWebModule, NativeModule } from 'expo';

class ReminderAlarmModule extends NativeModule<{}> {}

export default registerWebModule(ReminderAlarmModule, 'ReminderAlarmModule');
