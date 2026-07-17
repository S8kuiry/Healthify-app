import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppColors } from '@/hooks/use-app-colors';
import { getSleepForNight } from '@/domain/screenActivity/sleepCalculator';

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function yesterdayDate(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function yesterdayLabel(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function SleepSummaryCard() {
  const colors = useAppColors();
  const [isLoading, setIsLoading] = useState(true);
  const [lastNightMinutes, setLastNightMinutes] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSleepForNight(yesterdayDate())
      .then((result) => {
        if (cancelled) return;
        setLastNightMinutes(result.durationMinutes);
        setError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error('Failed to load last night sleep:', err);
        setError('Failed to load sleep data');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

  if (lastNightMinutes === null) {
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

  return (
    <View
      className="bg-cardBackground rounded-2xl p-4 mb-4"
      style={{ elevation: 3, borderWidth: 1, borderColor: `${colors.border}20` }}
    >
      <View className="flex-row items-center justify-between mb-2">
        <View className="flex-row items-center gap-2">
          <Feather name="moon" size={15} color={colors.accent} />
          <Text className="text-textPrimary font-bold text-sm tracking-tight">Last Night</Text>
        </View>
        <Text className="text-textMuted text-[11px] font-semibold">{yesterdayLabel()}</Text>
      </View>
      <View className="items-center py-4">
        <Text className="text-textPrimary font-bold text-2xl tabular-nums">
          {formatDuration(lastNightMinutes)}
        </Text>
        <Text className="text-textSecondary text-xs font-semibold mt-1">of sleep detected</Text>
      </View>
    </View>
  );
}