import { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useAppColors } from '@/hooks/use-app-colors';

const OPTIONS = [
  { label: '5m', minutes: 5 },
  { label: '15m', minutes: 15 },
  { label: '1h', minutes: 60 },
];

export default function SnoozePicker({ onSnooze }: { onSnooze: (minutes: number) => void }) {
  const [open, setOpen] = useState(false);
  const colors = useAppColors();

  // Default Closed State: Elegant minimalist chip indicator
  if (!open) {
    return (
      <Pressable 
        onPress={() => setOpen(true)}
        className="flex-row items-center gap-1 bg-cardBackground border border-accent px-2.5 py-1.5 rounded-xl active:opacity-75"
      >
        <Feather name="bell" size={10} color='rgb(5,150,105)' />
        <Text className="text-textSecondary text-[11px] font-semibold ml-1.5 tracking-wide">
          Snooze
        </Text>
      </Pressable>
    );
  }

  // Active Open State: Structural slider bar containing choices and cancel control
  return (
    <View className="flex-row items-center gap-1.5 bg-lightBackground/40 dark:bg-lightBackground/10 p-1 rounded-xl  animate-fade-in">
      {OPTIONS.map((opt) => (
        <Pressable
          key={opt.minutes}
          onPress={() => {
            onSnooze(opt.minutes);
            setOpen(false);
          }}
          className="bg-cardBackground border border-border/10 px-2 py-1 rounded-lg active:opacity-70 shadow-2xs"
        >
          <Text className="text-textPrimary text-xs font-bold tracking-tight">
            {opt.label}
          </Text>
        </Pressable>
      ))}
      
      {/* Dynamic Dismiss Trigger: Reverts deck layout state instantaneously */}
      <Pressable
        onPress={() => setOpen(false)}
        className="bg-cardBackground  px-2 py-1 rounded-lg active:opacity-70 shadow-2xs"
        hitSlop={8}
      >
        <Feather name="x" size={13} className="text-textMuted active:text-danger" />
      </Pressable>
    </View>
  );
}