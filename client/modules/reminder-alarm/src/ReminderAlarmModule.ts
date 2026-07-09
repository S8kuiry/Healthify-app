import { NativeModule, requireNativeModule } from 'expo';

declare class ReminderAlarmModule extends NativeModule<{}> {}

export default requireNativeModule<ReminderAlarmModule>('ReminderAlarm');
