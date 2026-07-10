import { useCallback, useEffect, useState } from 'react';
import { AppState, Modal, Platform, Pressable, Text, View } from 'react-native';
import ReminderAlarmModule from '../../modules/reminder-alarm/src';

type PermissionMode = 'exact' | 'fullscreen';

export default function ExactAlarmPermissionModal() {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<PermissionMode>('exact');

  const checkPermissionState = useCallback(async () => {
    if (Platform.OS !== 'android') return;
    try {
      // Exact-alarm access is checked first (needed to fire on time); once that's
      // granted we make sure the full-screen-intent permission is present too — on
      // Android 14+ that's what lets the alarm screen pop from the background.
      const exactGranted = await ReminderAlarmModule.hasExactAlarmPermission();
      if (!exactGranted) {
        setMode('exact');
        setVisible(true);
        return;
      }
      // Guard: the full-screen-intent methods only exist in a native build that
      // includes them. If JS was fast-refreshed before the app was rebuilt, skip
      // the check gracefully instead of crashing the Reminders screen.
      if (typeof ReminderAlarmModule.hasFullScreenIntentPermission !== 'function') {
        setVisible(false);
        return;
      }
      const fullScreenGranted = await ReminderAlarmModule.hasFullScreenIntentPermission();
      if (!fullScreenGranted) {
        setMode('fullscreen');
        setVisible(true);
        return;
      }
      setVisible(false);
    } catch (err) {
      // A permission probe must never take down the screen.
      console.warn('[ExactAlarmPermissionModal] permission check failed:', err);
      setVisible(false);
    }
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
    try {
      if (mode === 'exact') {
        await ReminderAlarmModule.openExactAlarmSettings();
      } else if (typeof ReminderAlarmModule.openFullScreenIntentSettings === 'function') {
        await ReminderAlarmModule.openFullScreenIntentSettings();
      }
    } catch (err) {
      console.warn('[ExactAlarmPermissionModal] open settings failed:', err);
    }
  };

  if (Platform.OS !== 'android') return null;

  const title = mode === 'exact' ? 'Precise Reminders Required' : 'Full-Screen Alarms Required';
  const body =
    mode === 'exact'
      ? 'To ring your health alarms at the exact scheduled minute — even when your device is asleep — Healthify needs Alarms & Reminders access in system settings.'
      : 'To show the full alarm screen when a reminder fires — even over the lock screen — Healthify needs Full-screen notifications access in system settings.';

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
            {title}
          </Text>
          <Text className="text-textSecondary text-xs font-medium mb-5 text-center leading-5">
            {body}
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
