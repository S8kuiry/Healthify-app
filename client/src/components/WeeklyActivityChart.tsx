// src/components/WeeklyActivityChart.tsx
import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { toLocalDateString, weekdayIndexMondayFirst } from '@/domain/date';
import { useAppColors } from '@/hooks/use-app-colors';

type DayPoint = { date: string; steps: number; calories: number };

type Props = {
  data: DayPoint[];
  stepGoal?: number;
  calorieGoal?: number;
};

type DayStatus = 'empty' | 'partial' | 'success' | 'logged';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const TRACK_HEIGHT = 110;
const DEFAULT_STEP_GOAL = 10_000;
const DEFAULT_CALORIE_GOAL = 300;

const STATUS_COLORS = {
  success: '#34D399',
  partial: '#EAB308',
  empty: 'rgba(148, 163, 184, 0.35)',
  logged: '#94a3b8',
} as const;

function getTodayDateString() {
  return toLocalDateString();
}

function accentAlpha(accent: string, alpha: number): string {
  const nums = accent.match(/[\d.]+/g);
  if (!nums || nums.length < 3) return accent;
  return `rgba(${nums[0]}, ${nums[1]}, ${nums[2]}, ${alpha})`;
}

function getDayStatus(value: number, scaleGoal: number, hasUserGoal: boolean): DayStatus {
  if (value === 0) return 'empty';
  if (!hasUserGoal) {
    if (value >= scaleGoal) return 'success';
    return 'partial';
  }
  if (value >= scaleGoal) return 'success';
  return 'partial';
}

function barFillClass(status: DayStatus, isToday: boolean): string {
  switch (status) {
    case 'success':
      return isToday ? 'bg-accent' : 'bg-accent/80';
    case 'partial':
      return isToday ? 'bg-[#EAB308]' : 'bg-[#EAB308]/70';
    case 'logged':
      return isToday ? 'bg-accent/20' : 'bg-accent/40';
    default:
      return '';
  }
}

export default function WeeklyActivityChart({ data, stepGoal, calorieGoal }: Props) {
  const [metric, setMetric] = useState<'steps' | 'calories'>('steps');
  const colors = useAppColors();
  const today = getTodayDateString();
  const userGoal = metric === 'steps' ? stepGoal : calorieGoal;
  const hasUserGoal = (userGoal ?? 0) > 0;
  const scaleGoal = hasUserGoal
    ? userGoal!
    : metric === 'steps'
      ? DEFAULT_STEP_GOAL
      : DEFAULT_CALORIE_GOAL;

  const values = data.map((d) => d[metric]);
  const total = values.reduce((a, b) => a + b, 0);
  const daysLogged = values.filter((v) => v > 0).length;
  const avg = daysLogged > 0 ? Math.round(total / daysLogged) : 0;
  const best = Math.max(...values, 0);
  const hasAnyData = total > 0;

  return (
    <View className="bg-cardBackground rounded-3xl p-5 pb-4 mb-5 shadow-sm">

      {/* Header row */}
      <View className="flex-row items-center justify-between mb-4">
        <View className="flex-row items-center">
          <View className="h-2 w-[2px] bg-accent mr-1.5" />
          <Text className="text-textSecondary text-[10px] font-bold tracking-[2px] uppercase">
            This Week
          </Text>
        </View>

        <View className="flex-row bg-backgroundElement/30 rounded-3xl p-0.5">
          <Pressable
            onPress={() => setMetric('steps')}
            className={`px-3 py-1 rounded-3xl ${metric === 'steps' ? 'bg-accent' : ''}`}
          >
            <Text
              className={`text-[10px] font-bold tracking-wide uppercase ${
                metric === 'steps' ? 'text-cardBackground' : 'text-textPrimary'
              }`}
            >
              Steps
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMetric('calories')}
            className={`px-3 py-1 rounded-3xl ${metric === 'calories' ? 'bg-accent' : ''}`}
          >
            <Text
              className={`text-[10px] font-bold tracking-wide uppercase ${
                metric === 'calories' ? 'text-cardBackground' : 'text-textPrimary'
              }`}
            >
              Energy
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Stats row */}
      <View className="flex-row mb-5">
        <View className="flex-1">
          <Text className="text-textMuted text-[9px] font-bold tracking-widest uppercase mb-0.5">
            Avg / day
          </Text>
          <Text
            className="text-textPrimary text-base font-black tracking-tight"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {avg.toLocaleString()}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-textMuted text-[9px] font-bold tracking-widest uppercase mb-0.5">
            Total
          </Text>
          <Text
            className="text-textPrimary text-base font-black tracking-tight"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {total.toLocaleString()}
          </Text>
        </View>
        <View className="flex-1">
          <Text className="text-textMuted text-[9px] font-bold tracking-widest uppercase mb-0.5">
            Best Day
          </Text>
          <Text
            className="text-base font-black tracking-tight text-accent"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {best.toLocaleString()}
          </Text>
        </View>
      </View>

      {/* Bar tracks */}
      <View className="flex-row items-end justify-between gap-0.5" style={{ height: TRACK_HEIGHT }}>
        {data.map((day) => {
          const value = day[metric];
          const isToday = day.date === today;
          const showPlaceholder = isToday && value === 0;
          const showBar = value > 0;
          const showTrack = showPlaceholder || showBar;

          const status = getDayStatus(value, scaleGoal, hasUserGoal);
          const barPct = showBar
            ? Math.min(100, Math.max(4, (value / scaleGoal) * 100))
            : 0;

          const stripeColor = showPlaceholder
            ? hasUserGoal
              ? STATUS_COLORS.empty
              : accentAlpha(colors.accent, 0.4)
            : !hasUserGoal
              ? accentAlpha(colors.accent, 0.55)
              : STATUS_COLORS[status];

              const trackClass = showPlaceholder
              ? hasUserGoal
                ? 'bg-transparent'   // or '' — no track bg for today placeholder
                : 'bg-accent/12'
              : hasUserGoal
                ? 'bg-transparent'   // no grey track when goal is set
                : 'bg-backgroundElement/40';
          return (
            <View key={day.date} className="flex-1 flex-row items-end justify-center px-0.5">
              {showTrack && (
                <View
                  className="rounded-2xl mr-0.5"
                  style={{
                    width: 2,
                    height: showPlaceholder ? 12 : TRACK_HEIGHT,
                    backgroundColor: stripeColor,
                    alignSelf: showPlaceholder ? 'flex-end' : 'stretch',
                  }}
                />
              )}

              {showTrack ? (
                <View
                  className={`flex-1 items-center justify-end overflow-hidden rounded-t-2xl ${trackClass}`}
                  style={{ height: TRACK_HEIGHT }}
                >
                  {hasUserGoal && (
                    <View
                      className="absolute w-full "
                      style={{ top: 0, left: 0 }}
                    />
                  )}

                  {showBar && (
                    <View
                      className={`rounded-t-md ${
                        !hasUserGoal
                          ? isToday
                            ? 'bg-accent'
                            : 'bg-accent/80'
                          : barFillClass(status, isToday)
                      }`}
                      style={{ width: '72%', height: `${barPct}%` }}
                    />
                  )}
                </View>
              ) : (
                <View style={{ height: TRACK_HEIGHT, flex: 1 }} />
              )}
            </View>
          );
        })}
      </View>

      {/* Day labels */}
      <View className="flex-row justify-between mt-2">
        {data.map((day) => {
          const weekdayIdx = weekdayIndexMondayFirst(day.date);
          const isToday = day.date === today;

          return (
            <View key={`label-${day.date}`} className="flex-1 items-center">
              <Text
                className={`text-[10px] font-bold ${
                  isToday ? 'text-accent' : 'text-textMuted'
                }`}
              >
                {DAY_LABELS[weekdayIdx]}
              </Text>
              {isToday && <View className="h-1 w-1 rounded-2xl bg-accent mt-1" />}
            </View>
          );
        })}
      </View>

      {!hasAnyData && (
        <Text className="text-textMuted text-[11px] font-medium text-center mt-4">
          No activity logged yet this week.
        </Text>
      )}
    </View>
  );
}
