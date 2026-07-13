import { requireNativeModule } from 'expo-modules-core';

interface ReminderAlarmModuleType {
  hasExactAlarmPermission(): Promise<boolean>;
  openExactAlarmSettings(): Promise<void>;
  hasFullScreenIntentPermission(): Promise<boolean>;
  openFullScreenIntentSettings(): Promise<void>;
  scheduleAlarm(id: string, label: string, timestampMs: number, repeat: boolean): Promise<void>;
  cancelAlarm(id: string): Promise<void>;
  getSystemAlarms(): Promise<{ title: string; uri: string }[]>;
  playAlarmPreview(uri: string): Promise<void>;
  stopAlarmPreview(): Promise<void>;
}

const ReminderAlarmModule = requireNativeModule<ReminderAlarmModuleType>('ReminderAlarmModule');
export default ReminderAlarmModule;
