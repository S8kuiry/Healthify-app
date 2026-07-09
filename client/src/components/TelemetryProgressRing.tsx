// src/components/TelemetryProgressRing.tsx
import React, { useState, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

type Props = {
  steps: number | null;
  calories: number | null;
  profile: {
    stepGoal: number;
    calorieGoal: number;
  } | null;
};

export default function TelemetryProgressRing({ steps, calories, profile }: Props) {
  const [metric, setMetric] = useState<'steps' | 'calories'>('steps');

  // 1. Resolve values based on the active metric selector
  const value = metric === 'steps' ? steps : calories;
  const goal = metric === 'steps' ? profile?.stepGoal : profile?.calorieGoal;
  const unit = metric === 'steps' ? 'steps' : 'kcal';
  const hasGoal = goal && goal > 0;

  // 2. Futuristic SVG Circular Computation Matrix
  const size = 110;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;

  const { progress, pct, dashOffset } = useMemo(() => {
    if (!hasGoal || value === null || value === 0) {
      return { progress: 0, pct: 0, dashOffset: circumference };
    }
    const calculatedProgress = Math.min(1, value / goal); // Cap visual ring overflow at 100%
    const calculatedPct = Math.round((value / goal) * 100);
    const calculatedOffset = circumference * (1 - calculatedProgress);
    
    return { progress: calculatedProgress, pct: calculatedPct, dashOffset: calculatedOffset };
  }, [value, goal, hasGoal, circumference]);

  return (
    <View className="bg-cardBackground rounded-3xl px-4 py-4 shadow-sm items-center justify-center min-h-[140px] mb-5">
      
      {/* Header Row with Context & Selector Switch */}
      <View className="flex-row items-center justify-between w-full mb-4">
        <View className="flex-row items-center">
          <View className="h-2 w-[2px] bg-accent mr-1.5" />
          <Text className="text-textSecondary text-[10px] font-bold tracking-[2px] uppercase">
            Telemetry Ring
          </Text>
        </View>

        <View className="flex-row bg-backgroundElement/50 rounded-full p-0.5">
          <Pressable
            onPress={() => setMetric('steps')}
            className={`px-3 py-1 rounded-full ${metric === 'steps' ? 'bg-accent' : ''}`}
          >
            <Text className={`text-[10px] font-bold tracking-wide uppercase ${metric === 'steps' ? 'text-cardBackground' : 'text-textPrimary'}`}>
              Steps
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setMetric('calories')}
            className={`px-3 py-1 rounded-full ${metric === 'calories' ? 'bg-accent' : ''}`}
          >
            <Text className={`text-[10px] font-bold tracking-wide uppercase ${metric === 'calories' ? 'text-cardBackground' : 'text-textPrimary'}`}>
              Energy
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Conditional Rendering Blocks based on Goal Data Presence */}
      {profile && hasGoal && value !== null ? (
        <>
          {/* Enhanced Futuristic Circle Frame */}
          <View style={{ width: size, height: size }} className="items-center justify-center mb-4">
            <Svg width={size} height={size}>
              {/* Rotate the group -90 degrees so the track animations begin precisely at 12 o'clock */}
              <G rotation="-90" origin={`${size / 2}, ${size / 2}`}>
                
                {/* Background Base Track Ring */}
                <Circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke="rgba(148, 163, 184, 0.15)"
                  strokeWidth={strokeWidth}
                  fill="transparent"
                />

                {/* Sub-track Visual Ring Glow Component */}
                {pct > 0 && (
                  <Circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    stroke="#7CF26B"
                    strokeWidth={strokeWidth + 2}
                    opacity={0.08}
                    fill="transparent"
                    strokeDasharray={`${circumference} ${circumference}`}
                    strokeDashoffset={dashOffset}
                    strokeLinecap="round"
                  />
                )}

                {/* Main Dynamic Progress Stroke Vector */}
                <Circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  stroke={metric === 'steps' ? '#7CF26B' : '#EAB308'}
                  strokeWidth={strokeWidth}
                  fill="transparent"
                  strokeDasharray={`${circumference} ${circumference}`}
                  strokeDashoffset={dashOffset}
                  strokeLinecap="round"
                />
              </G>
            </Svg>

            {/* Inner Ring Typography Core */}
            <View className="absolute items-center justify-center">
              <Text 
                className="text-textPrimary text-xl font-black tracking-tighter" 
                style={{ fontVariant: ['tabular-nums'] }}
              >
                {pct}%
              </Text>
            </View>
          </View>

          {/* Bottom Metrology Metadata Readings */}
          <Text className="text-textPrimary text-xs font-bold tracking-tight mb-0.5">
            Daily Goal Progress
          </Text>
          <Text 
            className="text-textMuted text-[11px] font-medium text-center px-4 leading-relaxed"
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {value.toLocaleString()} / {goal.toLocaleString()} {unit}
          </Text>
        </>
      ) : (
        /* Empty / Missing Goal Config State Layout */
        <>
          <View className="h-16 w-16 rounded-full border-[3px] border-backgroundElement/50 items-center justify-center mb-3">
            <View className="h-10 w-10 rounded-full border-[3px] border-accent/30 items-center justify-center" />
          </View>

          <Text className="text-textPrimary text-xs font-bold tracking-tight mb-1">
            Telemetry Target Offline
          </Text>
          <Text className="text-textMuted text-[11px] font-medium text-center px-4 leading-relaxed">
            Set a {metric === 'steps' ? 'step' : 'calorie'} goal in the dashboard interface to instantiate this tracker ring module.
          </Text>
        </>
      )}
    </View>
  );
}