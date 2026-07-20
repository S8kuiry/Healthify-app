import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppColors } from '@/hooks/use-app-colors';
import { useProfile } from '@/context/profileContext';
import { getWeeklySleep, type NightlySleep } from '@/domain/screenActivity/sleepCalculator';

function dayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'narrow' });
}

export default function SleepWeeklyGraph() {
  const colors = useAppColors();
  // Gate on dbReady so the release APK doesn't read before migrations run. See
  // the fuller note in Sleepwindowpicker.
  const { dbReady } = useProfile();
  const [weeklyData, setWeeklyData] = useState<NightlySleep[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!dbReady) return;

    let cancelled = false;
    getWeeklySleep()
      .then((result) => {
        if (!cancelled) setWeeklyData(result);
      })
      .catch((err) => console.error('Failed to load weekly sleep:', err))
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [dbReady]);

  if (isLoading) {
    return (
      <View
        className="bg-cardBackground rounded-2xl p-4 mb-4"
        style={{ elevation: 3, borderWidth: 1, borderColor: `${colors.border}20`, height: 254 }}
      />
    );
  }

  const weeklyWithData = weeklyData.filter((w) => w.durationMinutes !== null);

  if (weeklyWithData.length === 0) {
    return null;
  }

  const maxWeekly = Math.max(...weeklyWithData.map((d) => d.durationMinutes!), 60);

  return (
    <View
      className="bg-cardBackground rounded-2xl p-4 mb-4 h-[200px]"
      style={{ elevation: 3, borderWidth: 1, borderColor: `${colors.border}20` }}
    >
      <View className="flex-row items-center justify-between mb-6">
        <View className="flex-row items-center gap-2">
          <Feather name="bar-chart-2" size={15} color={colors.accent} />
          <Text className="text-textPrimary font-bold text-sm tracking-tight">This Week</Text>
        </View>
      </View>
      <View className="flex-row items-end justify-between" style={{ height: 150 }}>
        {weeklyData.map((night, idx) => (
          <View key={idx} className="items-center flex-1">
            <View style={{ height: 96, justifyContent: 'flex-end' }}>
              <View
                style={{
                  width: 17,
                  height: night.durationMinutes
                    ? Math.max(6, Math.round((night.durationMinutes / maxWeekly) * 96))
                    : 6,
                  borderRadius: 6,
                  backgroundColor: night.durationMinutes ? colors.accent : 'transparent',
                  borderWidth: night.durationMinutes ? 0 : 1.5,
                  borderStyle: 'dashed',
                  borderColor: night.durationMinutes ? undefined : `${colors.border}60`,
                }}
              />
            </View>
            <Text className="text-textMuted text-[9px] font-semibold mt-2">
              {dayLabel(night.nightDate)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}