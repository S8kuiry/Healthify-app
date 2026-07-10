import { requireNativeModule } from 'expo-modules-core';

interface ReminderAlarmModuleType {
  hasExactAlarmPermission(): Promise<boolean>;
  openExactAlarmSettings(): Promise<void>;
  hasFullScreenIntentPermission(): Promise<boolean>;
  openFullScreenIntentSettings(): Promise<void>;
  scheduleAlarm(id: string, label: string, timestampMs: number): Promise<void>;
  cancelAlarm(id: string): Promise<void>;
}

const ReminderAlarmModule = requireNativeModule<ReminderAlarmModuleType>('ReminderAlarmModule');
export default ReminderAlarmModule;
