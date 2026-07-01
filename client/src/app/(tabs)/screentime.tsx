import ScreenContainer from '@/components/ScreenContainer';
import React from 'react';
import { View, Text } from 'react-native';

export default function ScreenTimeScreen() {
  return (
    <ScreenContainer>
      <Text className="text-textPrimary text-3xl font-bold mb-1">Screen Time</Text>
      <Text className="text-textSecondary text-sm mb-6">Daily usage + sleep mode toggle</Text>

      <View className="bg-surface border border-border rounded-3xl p-4 mb-6">
        <Text className="text-textSecondary text-xs font-semibold">Today's screen time</Text>
        <Text className="text-textPrimary text-4xl font-bold mt-1">—</Text>
      </View>

      <Text className="p-4 rounded-2xl border border-dashed border-border text-textMuted text-xs text-center">
        UsageStatsManager integration + Sleep Mode toggle go here next.
      </Text>
    </ScreenContainer>
  );
}