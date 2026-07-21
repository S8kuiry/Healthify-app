import { useState, useCallback } from 'react';
import { View, Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useAppColors } from '@/hooks/use-app-colors';
import { useProfile } from '@/context/profileContext';
import { getLastCompletedSleep, type LastSleep } from '@/domain/screenActivity/sleepCalculator';

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Labels the card by the day the sleep window actually started. */
function windowLabel(bedTime: Date): string {
  return bedTime.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function formatClock(d: Date): string {
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function SleepSummaryCard() {
  const colors = useAppColors();
  // Gate the DB read on dbReady so the release APK doesn't query screen_sessions
  // before runMigrations() has created it (which throws -> "Failed to load sleep
  // data"). See the fuller note in Sleepwindowpicker.
  const { dbReady } = useProfile();
  const [isLoading, setIsLoading] = useState(true);
  const [lastSleep, setLastSleep] = useState<LastSleep | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-read on every focus, not just once when the DB becomes ready.
  //
  // The sleep row is written by the NATIVE side (ScreenActivityService) when the
  // window finalizes - a different process, long after this effect first ran. A
  // plain [dbReady] dependency meant the card kept showing its initial "no data"
  // result until the app was fully restarted, even though the wake-up
  // notification had already fired and the row existed. Refreshing on focus is
  // what makes tapping the notification (or just returning to the tab) show it.
  useFocusEffect(
    useCallback(() => {
      if (!dbReady) return;

      let cancelled = false;
      getLastCompletedSleep()
        .then((result) => {
          if (cancelled) return;
          setLastSleep(result);
          setError(null);
        })
        .catch((err) => {
          if (cancelled) return;
          console.error('Failed to load last sleep:', err);
          setError('Failed to load sleep data');
        })
        .finally(() => {
          if (!cancelled) setIsLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }, [dbReady])
  );

  if (isLoading) {
    return (
      <View
        className="bg-cardBackground rounded-2xl p-4 mb-4"
        style={{ elevation: 3, borderWidth: 1, borderColor: `${colors.border}20`, height: 132 }}
      />
    );
  }

  if (error) {
    return (
      <View
        className="bg-cardBackground rounded-3xl p-6 mb-4 items-center justify-center"
        style={{ elevation: 3, borderWidth: 1, borderColor: `${colors.border}20`, minHeight: 160 }}
      >
        <View
          className="h-12 w-12 rounded-full items-center justify-center mb-3"
          style={{ backgroundColor: `${colors.accent}18` }}
        >
          <Feather name="alert-circle" size={20} color={colors.accent} />
        </View>
        <Text className="text-textPrimary font-bold text-sm text-center">{error}</Text>
        <Text className="text-textSecondary text-xs text-center mt-2">
          Please try again or contact support if the problem persists.
        </Text>
      </View>
    );
  }

  // No window has closed yet - tracking is armed but has nothing to report.
  if (lastSleep === null) {
    return (
      <View
        className="bg-cardBackground rounded-3xl p-6 mb-4 items-center justify-center"
        style={{ elevation: 3, borderWidth: 1, borderColor: `${colors.border}20`, minHeight: 160 }}
      >
        <View
          className="h-12 w-12 rounded-full items-center justify-center mb-3"
          style={{ backgroundColor: `${colors.accent}18` }}
        >
          <Feather name="moon" size={20} color={colors.accent} />
        </View>
        <Text className="text-textPrimary font-bold text-sm text-center">Sleep data coming soon</Text>
        <Text className="text-textSecondary text-xs text-center mt-2">
          Screen activity tracking is recording. Your sleep will appear here once the sleep window closes.
        </Text>
      </View>
    );
  }

  // The window closed but tracking didn't cover it (service stopped, device
  // off). Saying so is the honest answer - claiming the full window here would
  // report sleep that was never actually observed.
  if (lastSleep.durationMinutes === null) {
    return (
      <View
        className="bg-cardBackground rounded-3xl p-6 mb-4 items-center justify-center"
        style={{ elevation: 3, borderWidth: 1, borderColor: `${colors.border}20`, minHeight: 160 }}
      >
        <View
          className="h-12 w-12 rounded-full items-center justify-center mb-3"
          style={{ backgroundColor: `${colors.accent}18` }}
        >
          <Feather name="alert-circle" size={20} color={colors.accent} />
        </View>
        <Text className="text-textPrimary font-bold text-sm text-center">
          Tracking was interrupted
        </Text>
        <Text className="text-textSecondary text-xs text-center mt-2">
          We couldn&apos;t measure your sleep for {windowLabel(lastSleep.bedTime)}. Keep the app
          allowed to run in the background so tracking stays active overnight.
        </Text>
      </View>
    );
  }

  return (
    <View
      className="bg-cardBackground rounded-2xl p-4 mb-4"
      style={{ elevation: 3, borderWidth: 1, borderColor: `${colors.border}20` }}
    >
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2">
          <Feather name="moon" size={15} color={colors.accent} />
          <Text className="text-textPrimary font-bold text-sm tracking-tight">Last Sleep</Text>
        </View>
        <Text className="text-textMuted text-[11px] font-semibold">
          {windowLabel(lastSleep.bedTime)}
        </Text>
      </View>
      <View className="items-center py-4">
        <Text className="text-textPrimary font-bold text-2xl tabular-nums">
          {formatDuration(lastSleep.durationMinutes)}
        </Text>
        <Text className="text-textSecondary text-xs font-semibold mt-1">of sleep detected</Text>
        <Text className="text-textMuted text-[11px] font-semibold mt-1">
          {formatClock(lastSleep.bedTime)} – {formatClock(lastSleep.wakeTime)}
        </Text>
      </View>
    </View>
  );
}