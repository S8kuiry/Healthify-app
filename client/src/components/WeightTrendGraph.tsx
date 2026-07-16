import React, { useRef, useMemo } from 'react';
import { View, Text, ScrollView, useColorScheme } from 'react-native';
import Svg, { Rect, Line, Polyline, Circle, Text as SvgText } from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import type { DailyActivity } from '@/db/dailyActivityRepo';
import { formatShortDayMonth } from '@/domain/date';
import { useAppColors } from '@/hooks/use-app-colors';

export interface WeightHistoryEntry {
  id: string;
  date: string;
  weightKg: number;
}

interface WeightTrendGraphProps {
  weightHistory: WeightHistoryEntry[];
  activity: DailyActivity[]; // all daily snapshots for the current year (+ live today)
}

const BAR_WIDTH = 20;
const BAR_GAP = 14;
const H_PAD = 16;
const CHART_HEIGHT = 130;
const TOP_LABEL_SPACE = 16;
const TOP_PAD = 4;
// Vertical band for the weight line. It sits inside the bars' plotting area:
// the top leaves room below the top labels, and the bottom stays a few px
// above the baseline gridline (CHART_HEIGHT - 20) so the lowest dot marker
// (r=4 + stroke) never dips below the graph or gets clipped.
const WEIGHT_TOP_Y = TOP_PAD + TOP_LABEL_SPACE + 8;
const WEIGHT_BOTTOM_Y = CHART_HEIGHT - 20 - 6;

const monthLabel = () => new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

// 'YYYY-MM' -> 'Jul'
const monthShort = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short' });
};

// Whole numbers show plainly (80), fractional show one decimal (79.5).
const formatWeight = (w: number) => (Number.isInteger(w) ? String(w) : w.toFixed(1));

// A chart column: either the carried-over anchor (last year's kept weight) or a month.
type Column = {
  key: string;
  kind: 'anchor' | 'month';
  label: string;
  avgSteps: number;
  isCurrent: boolean;
  weight?: number;
};

export default function WeightTrendGraph({ weightHistory, activity }: WeightTrendGraphProps) {
  const scrollRef = useRef<ScrollView>(null);
  const colors = useAppColors();
  const colorScheme = useColorScheme();
  const accent = colorScheme === 'dark' ? '#34D399' : '#059669';
  const iconColor = colorScheme === 'dark' ? 'rgb(246, 113, 135)' : 'rgb(233, 112, 137)';
  const svgTextColor = colorScheme === 'dark' ? 'rgba(229, 39, 5, 0.94)' : 'rgba(231, 39, 5, 0.93)';
  const weightLine = colorScheme === 'dark' ? 'rgb(245, 172, 71)' : 'rgb(244, 171, 76)';
  const barTrack = colorScheme === 'dark' ? 'rgba(148, 163, 184, 0.12)' : 'rgba(71, 85, 105, 0.08)';
  const gridColor = colorScheme === 'dark' ? '#94A3B8' : '#64748B';
  const dotFill = colorScheme === 'dark' ? '#FFFFFF' : '#FFFFFF';

  const stats = useMemo(() => {
    const now = new Date();
    const year = String(now.getFullYear());
    const yearStart = `${year}-01-01`;
    const currentMonth = `${year}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // Daily rows within the current calendar year (the chart resets each new year).
    const yearRows = activity
      .filter((r) => r.date.startsWith(`${year}-`))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Aggregate days -> months.
    const byMonth = new Map<string, { steps: number; calories: number; activeDays: number }>();
    for (const r of yearRows) {
      const m = r.date.slice(0, 7);
      const agg = byMonth.get(m) ?? { steps: 0, calories: 0, activeDays: 0 };
      agg.steps += r.steps;
      agg.calories += r.calories;
      if (r.steps > 0) agg.activeDays += 1;
      byMonth.set(m, agg);
    }

    // One weight per month = the latest weigh-in that month (this year only).
    // Iterating in date order means the last write for a month wins = most recent.
    const weightByMonth = new Map<string, number>();
    for (const w of [...weightHistory].sort((a, b) => a.date.localeCompare(b.date))) {
      if (w.date.startsWith(`${year}-`)) weightByMonth.set(w.date.slice(0, 7), w.weightKg);
    }

    // Carried-over "anchor" = most recent weigh-in from before this year. After the
    // year-rollover prune this is the single kept entry; it seeds the new year's trend.
    const pastWeights = weightHistory.filter((w) => w.date < yearStart);
    const anchorEntry = pastWeights.length
      ? pastWeights.reduce((a, b) => (a.date > b.date ? a : b))
      : null;

    // Contiguous month range: first month that has any data -> current month.
    const dataMonthIdxs = [...byMonth.keys(), ...weightByMonth.keys()].map((m) => Number(m.slice(5, 7)) - 1);
    const firstMonthIdx = dataMonthIdxs.length ? Math.min(...dataMonthIdxs) : now.getMonth();
    const months: string[] = [];
    for (let mi = firstMonthIdx; mi <= now.getMonth(); mi++) {
      months.push(`${year}-${String(mi + 1).padStart(2, '0')}`);
    }

    // Columns = optional leading anchor + one per month.
    const columns: Column[] = [];
    if (anchorEntry) {
      columns.push({
        key: 'anchor',
        kind: 'anchor',
        label: monthShort(anchorEntry.date.slice(0, 7)),
        avgSteps: 0,
        isCurrent: false,
        weight: anchorEntry.weightKg,
      });
    }
    for (const m of months) {
      const agg = byMonth.get(m);
      // Bar height = average steps per active day that month (comparable across
      // months of different length, and a partial current month isn't penalised).
      const avgSteps = agg && agg.activeDays > 0 ? Math.round(agg.steps / agg.activeDays) : 0;
      columns.push({
        key: m,
        kind: 'month',
        label: monthShort(m),
        avgSteps,
        isCurrent: m === currentMonth,
        weight: weightByMonth.get(m),
      });
    }

    const maxAvgSteps = Math.max(...columns.map((c) => c.avgSteps), 1);

    // Weight points (anchor + months) -> trend line vertical range + overall change.
    const allWeights = columns.map((c) => c.weight).filter((w): w is number => w !== undefined);
    const minWeight = allWeights.length ? Math.min(...allWeights) : 0;
    const maxWeight = allWeights.length ? Math.max(...allWeights) : 0;
    const weightChange =
      allWeights.length >= 2 ? allWeights[allWeights.length - 1] - allWeights[0] : null;

    // Header + footer are scoped to the CURRENT month (live/dynamic as the day grows).
    const currentRows = yearRows.filter((r) => r.date.startsWith(currentMonth));
    const totalSteps = currentRows.reduce((s, r) => s + r.steps, 0);
    const totalCalories = currentRows.reduce((s, r) => s + r.calories, 0);
    const activeDays = currentRows.filter((r) => r.steps > 0).length;
    const bestDay = currentRows.reduce(
      (best, r) => (r.steps > (best?.steps ?? 0) ? r : best),
      null as DailyActivity | null
    );

    const hasAnyData = columns.some((c) => c.avgSteps > 0 || c.weight !== undefined);

    return {
      columns, maxAvgSteps, minWeight, maxWeight, weightChange,
      totalSteps, totalCalories, activeDays, bestDay, hasAnyData,
    };
  }, [activity, weightHistory]);

  const chartWidth = Math.max(stats.columns.length * (BAR_WIDTH + BAR_GAP) + H_PAD * 2, 220);

  // Weight line points — one per column that has a weigh-in (anchor + months).
  const weightPoints = useMemo(() => {
    const range = stats.maxWeight - stats.minWeight;
    return stats.columns
      .map((c, i) => {
        if (c.weight === undefined) return null;
        const x = H_PAD + i * (BAR_WIDTH + BAR_GAP) + BAR_WIDTH / 2;
        const ratio = range === 0 ? 0.5 : (c.weight - stats.minWeight) / range;
        const y = WEIGHT_TOP_Y + (1 - ratio) * (WEIGHT_BOTTOM_Y - WEIGHT_TOP_Y);
        return { x, y, w: c.weight };
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
        {/* Slim stat header, inside the same card — current month, live */}
        <View className="flex-row px-4 pt-4 pb-3">
          <View className="flex-1 items-start">
            <View className="flex-row items-center gap-1 mb-1">
              <Feather name="trending-up" size={11} color={iconColor} />
              <Text className="text-textSecondary text-[9px] font-bold tracking-widest uppercase mb-1 ">Steps</Text>
            </View>
            <Text className="text-textPrimary text-base font-black tracking-tight" style={{ fontVariant: ['tabular-nums'] }}>
              {stats.totalSteps.toLocaleString()}
            </Text>
          </View>

          <View className="w-[1px] bg-backgroundElement/70 mx-3" />

          <View className="flex-1 items-start">
            <View className="flex-row items-center gap-1 mb-1">
              <Feather name="zap" size={11} color={iconColor} />
              <Text className="text-textSecondary text-[9px] font-bold tracking-widest uppercase mb-1">Kcal</Text>
            </View>
            <Text className="text-textPrimary  font-black tracking-tight " style={{ fontVariant: ['tabular-nums'] }}>
              {stats.totalCalories.toLocaleString()}
            </Text>

          </View>

          <View className="w-[1px] bg-backgroundElement/70 mx-3" />

          <View className="flex-1 items-start">
            <View className="flex-row items-center gap-1 mb-1">
              <Feather name="activity" size={11} color={iconColor} />
              <Text className="text-textSecondary text-[9px] font-bold tracking-widest uppercase mb-1">Weight</Text>
            </View>
            {stats.weightChange === null ? (
              <Text className="text-textMuted text-sm font-bold">—</Text>
            ) : (
              <Text
                className="text-textPrimary  font-black tracking-tight"
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

        {/* Combined bar + line chart — one bar per month, optional leading anchor */}
        {!stats.hasAnyData ? (
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

                {stats.columns.map((c, i) => {
                  // The leading anchor column carries no step bar — just its weight point.
                  if (c.kind === 'anchor') return null;
                  const barMaxHeight = CHART_HEIGHT - 20 - TOP_LABEL_SPACE - TOP_PAD;
                  const barHeight = Math.max((c.avgSteps / stats.maxAvgSteps) * barMaxHeight, 3);
                  const x = H_PAD + i * (BAR_WIDTH + BAR_GAP);
                  const y = CHART_HEIGHT - 20 - barHeight;

                  return (
                    <React.Fragment key={c.key}>
                      <Rect
                        x={x}
                        y={TOP_PAD + TOP_LABEL_SPACE}
                        width={BAR_WIDTH}
                        height={barMaxHeight}
                        rx={6}
                        fill={barTrack}
                      />
                      <Rect x={x} y={y} width={BAR_WIDTH} height={barHeight} rx={6} fill={accent} opacity={c.isCurrent ? 1 : 0.55} />
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

                {/* Weight marker + its kg value, one per column with a weigh-in */}
                {weightPoints.map((p, i) => (
                  <React.Fragment key={`w-${i}`}>
                    <SvgText
                      x={p.x - 2}
                      y={p.y - 12}
                      fontSize={9}
                      fontWeight="bold"
                      fill={svgTextColor}

                      textAnchor="middle"

                    >
                      {formatWeight(p.w)}kg
                    </SvgText>
                    <Circle cx={p.x} cy={p.y} r={4} fill={dotFill} stroke={weightLine} strokeWidth={2} />
                  </React.Fragment>
                ))}
              </Svg>

              {/* Column labels below chart (anchor month + each month) */}
              <View style={{ flexDirection: 'row', paddingLeft: H_PAD, marginTop: 4 }}>
                {stats.columns.map((c) => (
                  <Text
                    key={`m-${c.key}`}
                    className={`text-[8px] font-bold text-center ${c.isCurrent ? 'text-accent' : 'text-textMuted'}`}
                    style={{ width: BAR_WIDTH + BAR_GAP }}
                  >
                    {c.label}
                  </Text>
                ))}
              </View>
            </View>
          </ScrollView>
        )}

        {stats.bestDay && stats.bestDay.steps > 0 && (
          <View className="flex-row items-center gap-1.5 px-4 pb-4 pt-1">
            <Feather name="award" size={12} color={accent} />
            <View className="flex-row items-center gap-1.5">
              <Text className="text-textPrimary text-[11px] font-semibold"> Best day this Month  :  </Text>
              <Text className='text-textPrimary text-[11px] font-semibold'>{stats.bestDay.steps.toLocaleString()} steps on {formatShortDayMonth(stats.bestDay.date)}</Text>
            </View>

          </View>
        )}
      </View>
    </View>
  )
}
