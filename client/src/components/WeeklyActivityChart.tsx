// src/components/WeeklyActivityChart.tsx
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { toLocalDateString, weekdayIndexMondayFirst } from '@/domain/date';
type DayPoint = { date: string; steps: number; calories: number };

type Props = {
  data: DayPoint[];
  stepGoal?: number;
  calorieGoal?: number;
};

type DayStatus = 'empty' | 'partial' | 'success' | 'logged';

const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const TRACK_HEIGHT = 110;
const STATUS_COLORS = {
  success: '#34D399',
  partial: '#EAB308',
  empty: 'rgba(148, 163, 184, 0.35)',
  logged: '#94a3b8',
} as const;

function getTodayDateString() {
  return toLocalDateString();
}
function getDayStatus(value: number, goal?: number): DayStatus {
  if (value === 0) return 'empty';
  if (!goal || goal <= 0) return 'logged';
  if (value >= goal) return 'success';
  return 'partial';
}

function barFillClass(status: DayStatus, isToday: boolean): string {
  switch (status) {
    case 'success':
      return isToday ? 'bg-accent' : 'bg-accent/80';
    case 'partial':
      return isToday ? 'bg-[#EAB308]' : 'bg-[#EAB308]/70';
    case 'logged':
      return isToday ? 'bg-slate-400' : 'bg-slate-500';
    default:
      return 'bg-backgroundElement/30';
  }
}

export default function WeeklyActivityChart({ data, stepGoal, calorieGoal }: Props) {
  const [metric, setMetric] = useState<'steps' | 'calories'>('steps');
  const today = getTodayDateString();
  const goal = metric === 'steps' ? stepGoal : calorieGoal;
  const hasGoal = (goal ?? 0) > 0;

  const values = data.map((d) => d[metric]);
  const total = values.reduce((a, b) => a + b, 0);
  const daysLogged = values.filter((v) => v > 0).length;
  const avg = daysLogged > 0 ? Math.round(total / daysLogged) : 0;
  const best = Math.max(...values, 0);
  const hasAnyData = total > 0;

  const maxValue = useMemo(() => {
    return Math.max(...values, goal ?? 0, 1);
  }, [values, goal]);

  const goalLinePct = goal && goal > 0 ? Math.min(100, (goal / maxValue) * 100) : null;

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

        <View className="flex-row bg-backgroundElement/50 rounded-3xl p-0.5">
          <Pressable
            onPress={() => setMetric('steps')}
            className={`px-3 py-1 rounded-3xl ${metric === 'steps' ? 'bg-accent' : ''}`}
          >
            <Text
              className={`text-[10px] font-bold tracking-wide uppercase ${
                metric === 'steps' ? 'text-background' : 'text-textMuted'
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
                metric === 'calories' ? 'text-background' : 'text-textMuted'
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
            className={`text-base font-black tracking-tight ${
              hasGoal ? 'text-accent' : 'text-accent'
            }`}
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {best.toLocaleString()}
          </Text>
        </View>
      </View>

      {/* Bar tracks — fixed height only for bars */}
      <View className="flex-row items-end justify-between gap-0.5" style={{ height: TRACK_HEIGHT }}>
        {data.map((day) => {
          const value = day[metric];
          const status = getDayStatus(value, goal);
          const pct = Math.max(value > 0 ? 8 : 0, (value / maxValue) * 100);
          const stripeColor = STATUS_COLORS[status];

          return (
            <View key={day.date} className="flex-1 flex-row items-end justify-center px-0.5">
              {/* Goal status stripe */}
              <View
                className="rounded-2xl mr-0.5"
                style={{
                  width: 2,
                  height: status === 'empty' ? 12 : TRACK_HEIGHT,
                  backgroundColor: stripeColor,
                  alignSelf: status === 'empty' ? 'flex-end' : 'stretch',
                  marginBottom: status === 'empty' ? 0 : 0,
                }}
              />

              <View
                className="flex-1 items-center justify-end overflow-hidden rounded-t-2xl bg-backgroundElement"
                style={{ height: TRACK_HEIGHT }}
              >
                {goalLinePct !== null && (
                  <View
                    className="absolute w-full border-t border-dashed border-textMuted"
                    style={{ bottom: `${goalLinePct}%`, left: 0 }}
                  />
                )}

                {value > 0 ? (
                  <View
                    className={`rounded-t-md ${barFillClass(status, day.date === today)}`}
                    style={{ width: '72%', height: `${pct}%` }}
                  />
                ) : (
                  <View
                    className="rounded-3xl bg-backgroundElement"
                    style={{ width: 6, height: 6, marginBottom: 4 }}
                  />
                )}
              </View>
            </View>
          );
        })}
      </View>

      {/* Day labels — separate row so margins never clip */}
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
