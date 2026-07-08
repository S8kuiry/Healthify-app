import React, { useRef, useMemo } from 'react';
import { View, Text, ScrollView, useColorScheme } from 'react-native';
import Svg, { Rect, Line, Polyline, Circle } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import type { DailyActivity } from '@/db/dailyActivityRepo';
import { useAppColors } from '@/hooks/use-app-colors';

export interface WeightHistoryEntry {
  id: string;
  date: string;
  weightKg: number;
}

interface WeightTrendGraphProps {
  weightHistory: WeightHistoryEntry[];
  monthActivity: DailyActivity[]; // from getMonthActivity('YYYY-MM')
}

const BAR_WIDTH = 20;
const BAR_GAP = 14;
const H_PAD = 16;
const CHART_HEIGHT = 130;
const CAL_LABEL_SPACE = 16;
const TOP_PAD = 4;

const monthLabel = () => new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

export default function WeightTrendGraph({ weightHistory, monthActivity }: WeightTrendGraphProps) {
  const scrollRef = useRef<ScrollView>(null);
  const colors = useAppColors();
  const colorScheme = useColorScheme();
  const accent = colorScheme === 'dark' ? '#34D399' : '#059669';
  const weightLine = colorScheme === 'dark' ? '#F472B6' : '#DB2777';
  const barTrack = colorScheme === 'dark' ? 'rgba(148, 163, 184, 0.12)' : 'rgba(71, 85, 105, 0.08)';
  const gridColor = colorScheme === 'dark' ? '#94A3B8' : '#64748B';
  const dotFill = colorScheme === 'dark' ? '#161E31' : '#FFFFFF';

  const stats = useMemo(() => {
    const rows = [...monthActivity].sort((a, b) => a.date.localeCompare(b.date));

    const totalSteps = rows.reduce((sum, r) => sum + r.steps, 0);
    const totalCalories = rows.reduce((sum, r) => sum + r.calories, 0);
    const activeDays = rows.filter((r) => r.steps > 0).length;
    const bestDay = rows.reduce(
      (best, r) => (r.steps > (best?.steps ?? 0) ? r : best),
      null as DailyActivity | null
    );
    const maxSteps = Math.max(...rows.map((r) => r.steps), 1);

    const monthPrefix = rows[0]?.date.slice(0, 7);
    const weightByDate = new Map(weightHistory.map((w) => [w.date, w.weightKg]));
    const monthWeights = monthPrefix
      ? weightHistory.filter((w) => w.date.startsWith(monthPrefix)).sort((a, b) => a.date.localeCompare(b.date))
      : [];
    const weightChange =
      monthWeights.length >= 2
        ? monthWeights[monthWeights.length - 1].weightKg - monthWeights[0].weightKg
        : null;

    const weightsInMonth = rows.map((r) => weightByDate.get(r.date)).filter((w): w is number => w !== undefined);
    const minWeight = weightsInMonth.length ? Math.min(...weightsInMonth) : 0;
    const maxWeight = weightsInMonth.length ? Math.max(...weightsInMonth) : 0;

    return { rows, totalSteps, totalCalories, activeDays, bestDay, maxSteps, weightChange, weightByDate, minWeight, maxWeight };
  }, [monthActivity, weightHistory]);

  const chartWidth = Math.max(stats.rows.length * (BAR_WIDTH + BAR_GAP) + H_PAD * 2, 220);

  // weight line points — only for days that actually have a weight entry
  const weightPoints = useMemo(() => {
    const range = stats.maxWeight - stats.minWeight;
    return stats.rows
      .map((r, i) => {
        const w = stats.weightByDate.get(r.date);
        if (w === undefined) return null;
        const x = H_PAD + i * (BAR_WIDTH + BAR_GAP) + BAR_WIDTH / 2;
        const ratio = range === 0 ? 0.5 : (w - stats.minWeight) / range;
        const y = TOP_PAD + CAL_LABEL_SPACE + (1 - ratio) * (CHART_HEIGHT - CAL_LABEL_SPACE - TOP_PAD - 10) + 10;
        return { x, y, w };
      })
      .filter((p): p is { x: number; y: number; w: number } => p !== null);
  }, [stats]);

  return (
    <View className="mb-2">
      <View className="flex-row justify-between items-baseline mb-3 px-1">
        <Text className="text-textPrimary text-xs font-black tracking-tight uppercase">{monthLabel()}</Text>
        <Text className="text-textMuted text-[10px] font-bold tracking-wider uppercase">
          {stats.activeDays} active days
        </Text>
      </View>

      <View
        className="rounded-3xl bg-cardBackground overflow-hidden"
        style={{
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.06,
          shadowRadius: 14,
          elevation: 2,
        }}
      >
        {/* Slim stat header, inside the same card */}
        <View className="flex-row px-4 pt-4 pb-3">
          <View className="flex-1 items-start">
            <View className="flex-row items-center gap-1 mb-1">
              <Feather name="trending-up" size={11} color={weightLine} />
              <Text className="text-textSecondary text-[9px] font-bold tracking-widest uppercase mb-1 ">Steps</Text>
            </View>
            <Text className="text-textPrimary text-base font-black tracking-tight" style={{ fontVariant: ['tabular-nums'] }}>
              {stats.totalSteps.toLocaleString()}
            </Text>
          </View>

          <View className="w-[1px] bg-backgroundElement/70 mx-3" />

          <View className="flex-1 items-start">
            <View className="flex-row items-center gap-1 mb-1">
              <Feather name="zap" size={11} color={weightLine} />
              <Text className="text-textSecondary text-[9px] font-bold tracking-widest uppercase mb-1">Kcal</Text>
            </View>
            <Text className="text-textPrimary text-base font-black tracking-tight " style={{ fontVariant: ['tabular-nums'] }}>
              {stats.totalCalories.toLocaleString()}
            </Text>
      
          </View>

          <View className="w-[1px] bg-backgroundElement/70 mx-3" />

          <View className="flex-1 items-start">
            <View className="flex-row items-center gap-1 mb-1">
              <Feather name="activity" size={11} color={weightLine} />
              <Text className="text-textSecondary text-[9px] font-bold tracking-widest uppercase mb-1">Weight</Text>
            </View>
            {stats.weightChange === null ? (
              <Text className="text-textMuted text-sm font-bold">—</Text>
            ) : (
              <Text
                className="text-base font-black tracking-tight"
                style={{ fontVariant: ['tabular-nums'], color: stats.weightChange > 0 ? '#DC2626' : stats.weightChange < 0 ? accent : undefined }}
              >
                {stats.weightChange > 0 ? '+' : ''}
                {stats.weightChange.toFixed(1)}
                <Text className="text-xs"> kg</Text>
              </Text>
            )}
          </View>
        </View>

        <View style={{ height: 1, backgroundColor: 'rgba(0,0,0,0.05)' }} />

        {/* Combined bar + line chart */}
        {stats.rows.length === 0 ? (
          <View className="h-[150px] items-center justify-center">
            <Text className="text-textMuted text-[11px] font-medium">No activity logged yet this month.</Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            contentContainerStyle={{ paddingTop: 12, paddingBottom: 6 }}
          >
            <View style={{ width: chartWidth }}>
              <Svg width={chartWidth} height={CHART_HEIGHT}>
                <Line
                  x1={H_PAD}
                  y1={CHART_HEIGHT - 20}
                  x2={chartWidth - H_PAD}
                  y2={CHART_HEIGHT - 20}
                  stroke={gridColor}
                  strokeWidth={1}
                  opacity={0.15}
                />

                {stats.rows.map((r, i) => {
                  const barMaxHeight = CHART_HEIGHT - 20 - CAL_LABEL_SPACE - TOP_PAD;
                  const barHeight = Math.max((r.steps / stats.maxSteps) * barMaxHeight, 3);
                  const x = H_PAD + i * (BAR_WIDTH + BAR_GAP);
                  const y = CHART_HEIGHT - 20 - barHeight;
                  const isBest = stats.bestDay?.date === r.date && r.steps > 0;

                  return (
                    <React.Fragment key={r.date}>
                      <Rect
                        x={x}
                        y={TOP_PAD + CAL_LABEL_SPACE}
                        width={BAR_WIDTH}
                        height={barMaxHeight}
                        rx={6}
                        fill={barTrack}
                      />
                      <Rect x={x} y={y} width={BAR_WIDTH} height={barHeight} rx={6} fill={accent} opacity={isBest ? 1 : 0.55} />
                    </React.Fragment>
                  );
                })}

                {weightPoints.length > 1 && (
                  <Polyline
                    points={weightPoints.map((p) => `${p.x},${p.y}`).join(' ')}
                    fill="none"
                    stroke={weightLine}
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    strokeLinecap="round"
                  />
                )}

                {weightPoints.map((p, i) => (
                  <Circle key={`w-${i}`} cx={p.x} cy={p.y} r={4} fill={dotFill} stroke={weightLine} strokeWidth={2} />
                ))}
              </Svg>

              {/* Calorie labels above each bar */}
              {stats.rows.map((r, i) => (
                <Text
                  key={`cal-${r.date}`}
                  style={{
                    position: 'absolute',
                    left: H_PAD + i * (BAR_WIDTH + BAR_GAP) - 10,
                    top: 0,
                    width: BAR_WIDTH + 20,
                    textAlign: 'center',
                  }}
                  className="text-textMuted text-[8px] font-bold"
                  numberOfLines={1}
                >
                  {r.calories > 0 ? r.calories : ''}
                </Text>
              ))}

              {/* Day labels below chart */}
              <View style={{ flexDirection: 'row', paddingLeft: H_PAD, marginTop: 4 }}>
                {stats.rows.map((r) => (
                  <Text
                    key={`d-${r.date}`}
                    className="text-textMuted text-[8px] font-bold text-center"
                    style={{ width: BAR_WIDTH + BAR_GAP }}
                  >
                    {r.date.split('-')[2]}
                  </Text>
                ))}
              </View>
            </View>
          </ScrollView>
        )}

        {stats.bestDay && stats.bestDay.steps > 0 && (
          <View className="flex-row items-center gap-1.5 px-4 pb-4 pt-1">
            <Feather name="award" size={12} color={accent} />
            <Text className="text-textSecondary text-[11px] font-semibold">
              Best day: {stats.bestDay.steps.toLocaleString()} steps on {stats.bestDay.date.split('-')[2]}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}