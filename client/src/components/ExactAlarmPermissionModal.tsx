import { useCallback, useEffect, useState } from 'react';
import { AppState, Modal, Platform, Pressable, Text, View } from 'react-native';
import ReminderAlarmModule from '../../modules/reminder-alarm/src';

export default function ExactAlarmPermissionModal() {
  const [visible, setVisible] = useState(false);

  const checkPermissionState = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    const granted = await ReminderAlarmModule.hasExactAlarmPermission();
    setVisible(!granted);
  }, []);

  useEffect(() => {
    void checkPermissionState();

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        void checkPermissionState();
      }
    });

    return () => subscription.remove();
  }, [checkPermissionState]);

  const handleGrantPermission = async () => {
    await ReminderAlarmModule.openExactAlarmSettings();
  };

  if (Platform.OS !== 'android') return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => setVisible(false)}
    >
      <View className="flex-1 bg-black/50 items-center justify-center px-6">
        <View className="bg-cardBackground rounded-2xl p-6 w-full max-w-sm">
          <Text className="text-textPrimary text-lg font-black tracking-tight mb-1 text-center">
            Precise Reminders Required
          </Text>
          <Text className="text-textSecondary text-xs font-medium mb-5 text-center leading-5">
            To ring your health alarms at the exact scheduled minute — even when your device is
            asleep — Healthify needs Alarms & Reminders access in system settings.
          </Text>

          <View className="flex-row mt-2" style={{ gap: 8 }}>
            <Pressable
              onPress={() => setVisible(false)}
              className="flex flex-1 rounded-3xl border border-textSecondary border-dashed py-2 items-center justify-center bg-backgroundElement active:opacity-85"
            >
              <Text className="text-textPrimary text-xs font-black tracking-wide uppercase">
                Not Now
              </Text>
            </Pressable>

            <Pressable
              onPress={handleGrantPermission}
              className="flex flex-1 rounded-full py-2 items-center justify-center bg-accent/10 border border-accent border-dashed active:opacity-85"
            >
              <Text className="text-accent text-xs font-black tracking-wide uppercase">
                Configure
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
