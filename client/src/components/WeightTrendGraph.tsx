import React, { useRef, useMemo } from 'react';
import { View, Text, ScrollView, useColorScheme } from 'react-native';
import Svg, { Polyline, Circle, Line, Rect } from 'react-native-svg';

export interface WeightHistoryEntry {
  id: string;
  date: string;
  weightKg: number;
}

interface WeightTrendGraphProps {
  weightHistory: WeightHistoryEntry[];
}

const COLUMN_WIDTH = 74;
const H_PAD = 12;
const PLOT_HEIGHT = 110;
const TOP_SPACE = 36;
const BOTTOM_SPACE = 44;
const TOTAL_HEIGHT = TOP_SPACE + PLOT_HEIGHT + BOTTOM_SPACE;
const GRID_ROWS = 4;

const formatGraphDate = (dateStr: string) => {
  try {
    const [, month, day] = dateStr.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${day} ${months[parseInt(month, 10) - 1] || ''}`;
  } catch {
    return dateStr;
  }
};

function weightToY(weight: number, min: number, max: number): number {
  if (max === min) return PLOT_HEIGHT / 2;
  const ratio = (weight - min) / (max - min);
  return PLOT_HEIGHT - ratio * PLOT_HEIGHT;
}

export default function WeightTrendGraph({ weightHistory }: WeightTrendGraphProps) {
  const scrollRef = useRef<ScrollView>(null);
  const colorScheme = useColorScheme();
  const accent = colorScheme === 'dark' ? '#34D399' : '#059669';
  const dotFill = colorScheme === 'dark' ? '#161E31' : '#FFFFFF';
  const gridColor = colorScheme === 'dark' ? '#94A3B8' : '#64748B';
  const plotFill = colorScheme === 'dark' ? 'rgba(148, 163, 184, 0.06)' : 'rgba(71, 85, 105, 0.05)';

  const graphData = useMemo(() => {
    const sorted = [...weightHistory].sort((a, b) => a.date.localeCompare(b.date));
    const weights = sorted.map((e) => e.weightKg);

    const min = weights.length > 0 ? Math.min(...weights) : 0;
    const max = weights.length > 0 ? Math.max(...weights) : 0;

    const nodes = sorted.map((entry, index) => {
      const y = weightToY(entry.weightKg, min, max) + TOP_SPACE;
      const x = H_PAD + index * COLUMN_WIDTH + COLUMN_WIDTH / 2;

      let changeText = '—';
      let changeType: 'up' | 'down' | 'flat' = 'flat';

      if (index > 0) {
        const diff = entry.weightKg - sorted[index - 1].weightKg;
        if (diff > 0) {
          changeText = `▲ ${diff.toFixed(1)}`;
          changeType = 'up';
        } else if (diff < 0) {
          changeText = `▼ ${Math.abs(diff).toFixed(1)}`;
          changeType = 'down';
        }
      }

      return {
        ...entry,
        x,
        y,
        changeText,
        changeType,
      };
    });

    const polylinePoints = nodes.map((n) => `${n.x},${n.y}`).join(' ');
    const contentWidth = Math.max(nodes.length * COLUMN_WIDTH + H_PAD * 2, 200);

    return { nodes, min, max, polylinePoints, contentWidth };
  }, [weightHistory]);

  return (
    <View className="mb-2 ">
      <View className="flex-row justify-between items-baseline mb-3 px-1">
        <Text className="text-textPrimary text-xs font-black tracking-tight uppercase">Weight Trend</Text>
        {/* <Text className="text-textMuted text-[10px] font-bold tracking-wider uppercase">
          Last {graphData.nodes.length} Entries
        </Text> */}
      </View>

      <View className="h-[210px] rounded-3xl bg-cardBackground  py-4 px-4 shadow-sm relative overflow-hidden">
        {graphData.nodes.length === 0 ? (
          <View className="flex-1 items-center justify-center">
            <Text className="text-textMuted text-[11px] font-medium text-center leading-relaxed">
              No weight entries yet. Add logs below to see your trend.
            </Text>
          </View>
        ) : (
          <ScrollView
            ref={scrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
            contentContainerStyle={{ paddingVertical: 4 }}
          >
            <View style={{ width: graphData.contentWidth, height: TOTAL_HEIGHT }}>
              <Svg
                width={graphData.contentWidth}
                height={TOP_SPACE + PLOT_HEIGHT}
                style={{ position: 'absolute', top: 0, left: 0 }}
              >
                {/* Plot zone background + grid */}
                <Rect
                  x={H_PAD}
                  y={TOP_SPACE}
                  width={graphData.contentWidth - H_PAD * 2}
                  height={PLOT_HEIGHT}
                  rx={10}
                  fill={plotFill}
                />

                {Array.from({ length: GRID_ROWS + 1 }, (_, i) => {
                  const y = TOP_SPACE + (PLOT_HEIGHT / GRID_ROWS) * i;
                  const isBaseline = i === GRID_ROWS;
                  return (
                    <Line
                      key={`grid-h-${i}`}
                      x1={H_PAD}
                      y1={y}
                      x2={graphData.contentWidth - H_PAD}
                      y2={y}
                      stroke={gridColor}
                      strokeWidth={isBaseline ? 1.25 : 1}
                      opacity={isBaseline ? 0.35 : 0.14}
                    />
                  );
                })}

                {graphData.nodes.map((node) => (
                  <Line
                    key={`grid-v-${node.id}`}
                    x1={node.x}
                    y1={TOP_SPACE}
                    x2={node.x}
                    y2={TOP_SPACE + PLOT_HEIGHT}
                    stroke={gridColor}
                    strokeWidth={1}
                    opacity={0.1}
                  />
                ))}

                <Line
                  x1={H_PAD}
                  y1={TOP_SPACE}
                  x2={H_PAD}
                  y2={TOP_SPACE + PLOT_HEIGHT}
                  stroke={gridColor}
                  strokeWidth={1}
                  opacity={0.2}
                />
                <Line
                  x1={graphData.contentWidth - H_PAD}
                  y1={TOP_SPACE}
                  x2={graphData.contentWidth - H_PAD}
                  y2={TOP_SPACE + PLOT_HEIGHT}
                  stroke={gridColor}
                  strokeWidth={1}
                  opacity={0.2}
                />

                {graphData.nodes.length > 1 && (
                  <Polyline
                    points={graphData.polylinePoints}
                    fill="none"
                    stroke={accent}
                    strokeWidth={2.5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                )}

                {graphData.nodes.map((node) => (
                  <Circle
                    key={`dot-${node.id}`}
                    cx={node.x}
                    cy={node.y}
                    r={5}
                    fill={dotFill}
                    stroke={accent}
                    strokeWidth={2}
                  />
                ))}

              </Svg>

              {graphData.nodes.map((entry) => {
                const isMax = entry.weightKg === graphData.max && graphData.nodes.length > 1;
                const dotTop = entry.y;

                return (
                  <View key={`label-${entry.id}`}>
                    <Text
                      style={{
                        position: 'absolute',
                        left: entry.x - 28,
                        top: dotTop - 28,
                        width: 56,
                        textAlign: 'center',
                      }}
                      className={`text-[11px] font-black tracking-tight ${isMax ? 'text-accent' : 'text-textPrimary'}`}
                    >
                      {entry.weightKg}
                    </Text>

                    <Text
                      style={{
                        position: 'absolute',
                        left: entry.x - 28,
                        top: dotTop - 40,
                        width: 56,
                        textAlign: 'center',
                      }}
                      className={`text-[8px] font-black tracking-widest uppercase ${
                        entry.changeType === 'up'
                          ? 'text-danger'
                          : entry.changeType === 'down'
                            ? 'text-accent'
                            : 'text-textMuted'
                      }`}
                    >
                      {entry.changeText}
                    </Text>

                    <Text
                      style={{
                        position: 'absolute',
                        left: entry.x - 34,
                        top: TOP_SPACE + PLOT_HEIGHT + 10,
                        width: 68,
                        textAlign: 'center',
                      }}
                      className="text-textSecondary text-[9px] font-black tracking-tight uppercase"
                    >
                      {formatGraphDate(entry.date)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}
