import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getSleepForNight } from '@/domain/screenActivity/sleepCalculator';
import { useAppColors } from '@/hooks/use-app-colors';

function toLocalDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function yesterdayDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return toLocalDateString(d);
}

function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function formatNightLabel(nightDate: string): string {
  const d = new Date(`${nightDate}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export default function SleepSummaryCard() {
  const colors = useAppColors();
  const [loading, setLoading] = useState(true);
  const [durationMinutes, setDurationMinutes] = useState<number | null>(null);
  const nightDate = yesterdayDateString();

  useEffect(() => {
    let cancelled = false;
    getSleepForNight(nightDate).then((result) => {
      if (cancelled) return;
      setDurationMinutes(result.durationMinutes);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [nightDate]);

  const hasData = !loading && durationMinutes !== null;

  return (
    <View
      className="bg-cardBackground rounded-2xl p-4 mb-4 shadow-lg shadow-black/10"
      style={{ elevation: 3, borderWidth: 1, borderColor: `${colors.border}20` }}
    >
      <View className="flex-row items-center justify-between mb-3">
        <View className="flex-row items-center gap-2">
          <Feather name="moon" size={15} color={colors.accent} />
          <Text className="text-textPrimary font-bold text-sm tracking-tight">Last Night</Text>
        </View>
        <Text className="text-textMuted text-[11px] font-semibold">
          {formatNightLabel(nightDate)}
        </Text>
      </View>

      {loading ? (
        <View className="items-center py-6">
          <View
            className="h-8 w-32 rounded-lg"
            style={{ backgroundColor: `${colors.border}15` }}
          />
        </View>
      ) : hasData ? (
        <View className="items-center py-4">
          <Text className="text-textPrimary font-bold text-3xl tabular-nums">
            {formatDuration(durationMinutes!)}
          </Text>
          <Text className="text-textSecondary text-xs font-semibold mt-1">of sleep detected</Text>
        </View>
      ) : (
        <View className="items-center py-6 px-4">
          <View
            className="h-11 w-11 rounded-full items-center justify-center mb-2"
            style={{ backgroundColor: colors.accentLight ?? `${colors.accent}18` }}
          >
            <Feather name="moon" size={18} color={colors.accent} />
          </View>
          <Text className="text-textPrimary font-bold text-sm text-center">
            No sleep data yet
          </Text>
          <Text className="text-textMuted text-[11px] text-center mt-1">
            Set your sleep window above — we'll start tracking tonight.
          </Text>
        </View>
      )}
    </View>
  );
}