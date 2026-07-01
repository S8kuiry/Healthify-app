import ScreenContainer from '@/components/ScreenContainer';
import React from 'react';
import { Text } from 'react-native';

export default function RemindersScreen() {
  return (
    <ScreenContainer>
      <Text className="text-textPrimary text-3xl font-bold mb-1">Reminders</Text>
      <Text className="text-textSecondary text-sm mb-6">
        Create events with notes, set multiple alarm times, get audible alerts
      </Text>

      <Text className="p-4 rounded-2xl border border-dashed border-border text-textMuted text-xs text-center">
        Multi-trigger alarm system (AlarmManager-backed) goes here next.
      </Text>
    </ScreenContainer>
  );
}