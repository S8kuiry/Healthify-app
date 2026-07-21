import React, { useState, useCallback, useMemo } from 'react';
import { View, Text } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Svg, {
  Defs,
  LinearGradient,
  Stop,
  Path,
  Line,
  Circle,
  Text as SvgText,
} from 'react-native-svg';
import { Feather } from '@expo/vector-icons';
import { useAppColors } from '@/hooks/use-app-colors';
import { useProfile } from '@/context/profileContext';
import { getRecentSleepWindows, type NightlySleep } from '@/domain/screenActivity/sleepCalculator';

const CHART_HEIGHT = 132;
const TOP_PAD = 18; // room for the value label above the highest marker
const BOTTOM_PAD = 6; // keeps the lowest marker clear of the baseline
const H_PAD = 18;

function dayLabel(dateStr: string): string {
  // Parse as LOCAL time. `new Date('YYYY-MM-DD')` is parsed as UTC and would
  // render the previous weekday for anyone behind UTC.
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'narrow' });
}

function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h${m}`;
}

/**
 * Builds a smooth path through the points using a monotone-ish cubic: each
 * control point is pulled horizontally toward its neighbour, which keeps the
 * curve from overshooting into impossible negative-sleep territory the way a
 * plain cardinal spline does.
 */
function buildSmoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;

  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i];
    const p1 = pts[i + 1];
    const cx = (p0.x + p1.x) / 2;
    d += ` C ${cx} ${p0.y}, ${cx} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

export default function SleepWeeklyGraph() {
  const colors = useAppColors();
  // Gate on dbReady so the release APK doesn't read before migrations run. See
  // the fuller note in Sleepwindowpicker.
  const { dbReady } = useProfile();
  const [weeklyData, setWeeklyData] = useState<NightlySleep[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [width, setWidth] = useState(0);

  // Refresh on focus: sleep rows are written by the native side after a window
  // finalizes, so a one-shot [dbReady] read would never pick them up without a
  // full app restart. See the fuller note in Sleepsummarycard.
  useFocusEffect(
    useCallback(() => {
      if (!dbReady) return;

      let cancelled = false;
      getRecentSleepWindows()
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
    }, [dbReady])
  );

  const measured = useMemo(() => {
    const withData = weeklyData.filter((w) => w.durationMinutes !== null);
    const durations = withData.map((w) => w.durationMinutes!);
    const avg = durations.length
      ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
      : null;
    const best = durations.length ? Math.max(...durations) : null;
    return { withData, avg, best };
  }, [weeklyData]);

  const geometry = useMemo(() => {
    if (width <= 0 || weeklyData.length === 0) return null;

    const innerW = width - H_PAD * 2;
    const plotTop = TOP_PAD;
    const plotBottom = CHART_HEIGHT - BOTTOM_PAD;
    const plotH = plotBottom - plotTop;

    // Scale headroom to the largest night so the curve fills the card, with a
    // sane floor so a single short nap doesn't render as a full-height spike.
    const maxVal = Math.max(...weeklyData.map((w) => w.durationMinutes ?? 0), 60);

    // A single point has no span to divide, so pin it to the centre.
    const stepX = weeklyData.length > 1 ? innerW / (weeklyData.length - 1) : 0;

    const points = weeklyData.map((night, i) => ({
      x: weeklyData.length > 1 ? H_PAD + i * stepX : H_PAD + innerW / 2,
      y: plotBottom - ((night.durationMinutes ?? 0) / maxVal) * plotH,
      night,
    }));

    // The area/line only spans nights that actually have a measured duration -
    // an 'incomplete' night is a gap in knowledge, not a zero, so drawing
    // through it would invent a data point we never observed.
    const solid = points.filter((p) => p.night.durationMinutes !== null);
    const linePath = buildSmoothPath(solid);
    const areaPath = solid.length
      ? `${linePath} L ${solid[solid.length - 1].x} ${plotBottom} L ${solid[0].x} ${plotBottom} Z`
      : '';

    const avgY =
      measured.avg !== null ? plotBottom - (measured.avg / maxVal) * plotH : null;

    return { points, solid, linePath, areaPath, plotTop, plotBottom, avgY };
  }, [width, weeklyData, measured.avg]);

  if (isLoading) {
    return (
      <View
        className="bg-cardBackground rounded-3xl p-4 mb-4"
        style={{ elevation: 3, borderWidth: 1, borderColor: `${colors.border}20`, height: 254 }}
      />
    );
  }

  const hasData = measured.withData.length > 0;

  return (
    <View
      className="bg-cardBackground rounded-3xl mb-4 overflow-hidden"
      style={{ elevation: 3, borderWidth: 1, borderColor: `${colors.border}20` }}
    >
      {/* Header: title left, at-a-glance stats right */}
      <View className="flex-row items-center justify-between px-4 pt-4 pb-1">
        <View className="flex-row items-center gap-2">
          <Feather name="activity" size={14} color={colors.accent} />
          <Text className="text-textPrimary font-bold text-sm tracking-tight">Recent Sleep</Text>
        </View>
        {hasData && measured.avg !== null && (
          <View className="flex-row items-baseline gap-1">
            <Text className="text-textMuted text-[9px] font-bold tracking-widest uppercase">
              Avg
            </Text>
            <Text
              className="text-textPrimary text-xs font-black tracking-tight"
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {formatDuration(measured.avg)}
            </Text>
          </View>
        )}
      </View>

      <View
        style={{ height: CHART_HEIGHT + 26 }}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        {width > 0 && (
          <>
            <Svg width={width} height={CHART_HEIGHT}>
              <Defs>
                {/* Area fill fades out downward so the baseline dissolves into the card */}
                <LinearGradient id="sleepArea" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={colors.accent} stopOpacity={0.42} />
                  <Stop offset="0.55" stopColor={colors.accent} stopOpacity={0.14} />
                  <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
                </LinearGradient>
                <LinearGradient id="sleepStroke" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor={colors.accent} stopOpacity={0.55} />
                  <Stop offset="0.5" stopColor={colors.accent} stopOpacity={1} />
                  <Stop offset="1" stopColor={colors.accent} stopOpacity={0.85} />
                </LinearGradient>
              </Defs>

              {/* Horizontal guide rails - subtle, purely for depth */}
              {[0, 0.5, 1].map((t) => {
                const y = TOP_PAD + t * (CHART_HEIGHT - BOTTOM_PAD - TOP_PAD);
                return (
                  <Line
                    key={`g-${t}`}
                    x1={H_PAD}
                    y1={y}
                    x2={width - H_PAD}
                    y2={y}
                    stroke={colors.border}
                    strokeWidth={1}
                    opacity={0.08}
                  />
                );
              })}

              {geometry && hasData && (
                <>
                  {/* Average reference line */}
                  {geometry.avgY !== null && measured.withData.length > 1 && (
                    <Line
                      x1={H_PAD}
                      y1={geometry.avgY}
                      x2={width - H_PAD}
                      y2={geometry.avgY}
                      stroke={colors.accent}
                      strokeWidth={1}
                      strokeDasharray="3 4"
                      opacity={0.4}
                    />
                  )}

                  {geometry.areaPath !== '' && (
                    <Path d={geometry.areaPath} fill="url(#sleepArea)" />
                  )}
                  {geometry.solid.length > 1 && (
                    <Path
                      d={geometry.linePath}
                      fill="none"
                      stroke="url(#sleepStroke)"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  )}

                  {/* Markers: filled for measured nights, hollow dash for gaps */}
                  {geometry.points.map((p, i) => {
                    const isGap = p.night.durationMinutes === null;
                    if (isGap) {
                      return (
                        <Circle
                          key={`m-${i}`}
                          cx={p.x}
                          cy={geometry.plotBottom}
                          r={3}
                          fill="none"
                          stroke={colors.textMuted}
                          strokeWidth={1.5}
                          opacity={0.5}
                        />
                      );
                    }
                    const isBest = p.night.durationMinutes === measured.best;
                    return (
                      <React.Fragment key={`m-${i}`}>
                        {/* Glow halo under the marker for the futuristic lift */}
                        <Circle cx={p.x} cy={p.y} r={7} fill={colors.accent} opacity={0.16} />
                        <Circle
                          cx={p.x}
                          cy={p.y}
                          r={4}
                          fill={colors.cardBackground}
                          stroke={colors.accent}
                          strokeWidth={2.5}
                        />
                        {isBest && (
                          <SvgText
                            x={p.x}
                            y={p.y - 11}
                            fontSize={9}
                            fontWeight="bold"
                            fill={colors.textSecondary}
                            textAnchor="middle"
                          >
                            {formatDuration(p.night.durationMinutes!)}
                          </SvgText>
                        )}
                      </React.Fragment>
                    );
                  })}
                </>
              )}

              {/* Empty state: a dormant baseline so the card still reads as a chart */}
              {!hasData && (
                <>
                  <Path
                    d={`M ${H_PAD} ${CHART_HEIGHT - BOTTOM_PAD - 18}
                        C ${width * 0.3} ${CHART_HEIGHT - BOTTOM_PAD - 34},
                          ${width * 0.62} ${CHART_HEIGHT - BOTTOM_PAD - 6},
                          ${width - H_PAD} ${CHART_HEIGHT - BOTTOM_PAD - 26}`}
                    fill="none"
                    stroke={colors.textMuted}
                    strokeWidth={2}
                    strokeDasharray="5 6"
                    strokeLinecap="round"
                    opacity={0.35}
                  />
                </>
              )}
            </Svg>

            {/* Day labels, aligned to each point's x */}
            {geometry && hasData && (
              <View style={{ height: 20, marginTop: 2 }}>
                {geometry.points.map((p, i) => (
                  <Text
                    key={`d-${i}`}
                    className="text-textMuted text-[9px] font-bold absolute text-center"
                    style={{ left: p.x - 10, width: 20 }}
                  >
                    {dayLabel(p.night.nightDate)}
                  </Text>
                ))}
              </View>
            )}
          </>
        )}

        {!hasData && (
          <View className="absolute inset-0 items-center justify-center px-8">
            <Text className="text-textSecondary text-[11px] font-semibold text-center">
              Your sleep trend will appear here
            </Text>
            <Text className="text-textMuted text-[10px] text-center mt-1">
              A point is added each time your sleep window closes
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}
