import { useState, useEffect } from 'react';
import { View, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getWeeklySleep, type NightlySleep } from '@/domain/screenActivity/sleepCalculator';
import { useAppColors } from '@/hooks/use-app-colors';

const MAX_BAR_HEIGHT = 96;
const MIN_BAR_HEIGHT = 6; // Keeps a sliver visible for very short/zero durations, distinct from "no data"

function dayLabel(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'narrow' });
}

function formatDuration(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

interface BarProps {
  point: NightlySleep;
  maxMinutes: number;
  accent: string;
  border: string;
}

function Bar({ point, maxMinutes, accent, border }: BarProps) {
  const hasData = point.durationMinutes !== null;
  const height = hasData
    ? Math.max(MIN_BAR_HEIGHT, Math.round((point.durationMinutes! / maxMinutes) * MAX_BAR_HEIGHT))
    : MIN_BAR_HEIGHT;

  return (
    <View className="items-center flex-1">
      <View style={{ height: MAX_BAR_HEIGHT, justifyContent: 'flex-end' }}>
        <View
          style={{
            width: 18,
            height,
            borderRadius: 6,
            backgroundColor: hasData ? accent : 'transparent',
            borderWidth: hasData ? 0 : 1.5,
            borderStyle: hasData ? 'solid' : 'dashed',
            borderColor: hasData ? undefined : `${border}60`,
          }}
        />
      </View>
      <Text className="text-textMuted text-[9px] font-semibold mt-2">
        {dayLabel(point.nightDate)}
      </Text>
    </View>
  );
}

export default function SleepWeeklyGraph() {
  const colors = useAppColors();
  const [points, setPoints] = useState<NightlySleep[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    getWeeklySleep().then((result) => {
      if (!cancelled) setPoints(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const trackedDurations = (points ?? [])
    .map((p) => p.durationMinutes)
    .filter((d): d is number => d !== null);
  const maxMinutes = trackedDurations.length > 0 ? Math.max(...trackedDurations, 60) : 480;
  const avgMinutes =
    trackedDurations.length > 0
      ? Math.round(trackedDurations.reduce((sum, d) => sum + d, 0) / trackedDurations.length)
      : null;

  return (
    <View
      className="bg-cardBackground rounded-2xl p-4 mb-4 shadow-lg shadow-black/10"
      style={{ elevation: 3, borderWidth: 1, borderColor: `${colors.border}20` }}
    >
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center gap-2">
          <Feather name="bar-chart-2" size={15} color={colors.accent} />
          <Text className="text-textPrimary font-bold text-sm tracking-tight">This Week</Text>
        </View>
        {avgMinutes !== null && (
          <View
            className="rounded-full px-2.5 py-1"
            style={{ backgroundColor: colors.accentLight ?? `${colors.accent}18` }}
          >
            <Text className="text-accent font-bold text-[11px]">
              avg {formatDuration(avgMinutes)}
            </Text>
          </View>
        )}
      </View>

      {points === null ? (
        <View style={{ height: MAX_BAR_HEIGHT + 24 }} />
      ) : (
        <View className="flex-row items-end justify-between">
          {points.map((point) => (
            <Bar
              key={point.nightDate}
              point={point}
              maxMinutes={maxMinutes}
              accent={colors.accent}
              border={colors.border}
            />
          ))}
        </View>
      )}
    </View>
  );
}