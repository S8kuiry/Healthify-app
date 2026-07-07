import { memo, useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, Pressable, Switch, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { useAppColors } from '@/hooks/use-app-colors';
import { AppColors } from '@/constants/appColors';
import { parseReminderInput } from '@/domain/reminders/reminderParser';
import type { ParsedReminderDraft, ParsedTimeDraft } from '@/domain/reminders/types';

type Props = {
  initialDraft: ParsedReminderDraft;
  title: string;
  onSave: (draft: ParsedReminderDraft) => void;
  onCancel: () => void;
};

type ColorSet = (typeof AppColors)[keyof typeof AppColors];

type TimeCardProps = {
  time: ParsedTimeDraft;
  index: number;
  timesCount: number;
  pickerOpen: boolean;
  colors: ColorSet;
  onRemove: (index: number) => void;
  onOpenPicker: (index: number) => void;
  onClosePicker: () => void;
  onUpdate: (index: number, patch: Partial<ParsedTimeDraft>) => void;
};

const BLANK_TIME: ParsedTimeDraft = {
  time: null,
  repeat: 'once',
  date: null,
  fireCount: 1,
  fireIntervalSeconds: 60,
  repeatBurstDaily: true,
};

const TimeCard = memo(function TimeCard({
  time: t,
  index: i,
  timesCount,
  pickerOpen,
  colors,
  onRemove,
  onOpenPicker,
  onClosePicker,
  onUpdate,
}: TimeCardProps) {
  return (
    <View className="bg-cardBackground rounded-2xl p-4 mb-3">
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-textSecondary text-[11px] font-bold tracking-widest uppercase">
          Time {timesCount > 1 ? `#${i + 1}` : ''}
        </Text>
        {timesCount > 1 && (
          <Pressable
            onPress={() => onRemove(i)}
            className="flex-row items-center gap-1 bg-danger/10 px-2.5 py-1 rounded-full active:opacity-60"
          >
            <Feather name="x" size={10} color={colors.danger} />
            <Text className="text-danger text-[10px] font-bold tracking-wide">Remove</Text>
          </Pressable>
        )}
      </View>

      <Pressable
        onPress={() => onOpenPicker(i)}
        className="flex-row items-center bg-backgroundElement/60 rounded-2xl px-4 py-3.5 active:opacity-70"
      >
        <Feather name="clock" size={15} color={t.time ? colors.accent : colors.textMuted} />
        <Text
          className={`text-[15px] font-bold ml-2.5 ${t.time ? 'text-textPrimary' : 'text-textMuted'}`}
        >
          {t.time ?? 'No time set — tap to choose'}
        </Text>
      </Pressable>

      {pickerOpen && (
        <DateTimePicker
          mode="time"
          value={t.time ? new Date(`2000-01-01T${t.time}:00`) : new Date()}
          onChange={(_, selectedDate) => {
            onClosePicker();
            if (selectedDate) {
              const hh = String(selectedDate.getHours()).padStart(2, '0');
              const mm = String(selectedDate.getMinutes()).padStart(2, '0');
              onUpdate(i, { time: `${hh}:${mm}` });
            }
          }}
        />
      )}

      <View className="flex-row items-center justify-between mt-4 pt-3.5">
        <View className="flex-row items-center gap-2">
          <Feather name="refresh-cw" size={13} color={colors.textSecondary} />
          <Text className="text-textPrimary text-[13px] font-semibold">Repeat daily</Text>
        </View>
        <Switch
          value={t.repeat === 'daily'}
          onValueChange={(val) => onUpdate(i, { repeat: val ? 'daily' : 'once' })}
          trackColor={{ false: colors.backgroundElement, true: colors.accent }}
          thumbColor="#ffffff"
        />
      </View>

      <View className="flex-row items-center justify-between mt-3.5">
        <View className="flex-row items-center gap-2">
          <Feather name="bell" size={13} color={colors.textSecondary} />
          <Text className="text-textPrimary text-[13px] font-semibold">Pop count</Text>
        </View>
        <View className="bg-backgroundElement/60 rounded-xl px-3 py-2 w-14">
          <TextInput
            keyboardType="number-pad"
            value={String(t.fireCount)}
            onChangeText={(val) => {
              const n = Math.min(Math.max(parseInt(val, 10) || 1, 1), 5);
              onUpdate(i, { fireCount: n });
            }}
            style={{
              fontSize: 11,
              fontWeight: '700',
              color: colors.textPrimary,
              padding: 0,
              textAlign: 'center',
            }}
          />
        </View>
      </View>

      {t.repeat === 'daily' && t.fireCount > 1 && (
        <View className="flex-row items-center justify-between mt-3.5">
          <View className="flex-row items-center gap-2 flex-1 pr-3">
            <Feather name="refresh-cw" size={13} color={colors.textSecondary} />
            <Text className="text-textPrimary text-[13px] font-semibold">
              Repeat burst every day
            </Text>
          </View>
          <Switch
            value={t.repeatBurstDaily}
            onValueChange={(val) => onUpdate(i, { repeatBurstDaily: val })}
            trackColor={{ false: colors.backgroundElement, true: colors.accent }}
            thumbColor="#ffffff"
          />
        </View>
      )}
    </View>
  );
});

export default function ReminderDraftEditor({ initialDraft, title, onSave, onCancel }: Props) {
  const colors = useAppColors();
  const [label, setLabel] = useState(initialDraft.label ?? '');
  const [times, setTimes] = useState<ParsedTimeDraft[]>(initialDraft.times);
  const [pickerOpenIndex, setPickerOpenIndex] = useState<number | null>(null);

  const addTime = useCallback(() => {
    setTimes((prev) => [...prev, { ...BLANK_TIME }]);
  }, []);

  const removeTime = useCallback((index: number) => {
    setTimes((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const updateTime = useCallback((index: number, patch: Partial<ParsedTimeDraft>) => {
    setTimes((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }, []);

  const openPicker = useCallback((index: number) => {
    setPickerOpenIndex(index);
  }, []);

  const closePicker = useCallback(() => {
    setPickerOpenIndex(null);
  }, []);

  // Auto-extract time from natural language in the label (e.g. "in 10 mins")
  useEffect(() => {
    const trimmed = (label ?? '').trim();
    if (!trimmed) return;

    const timeout = setTimeout(() => {
      const parsed = parseReminderInput(trimmed);
      const first = parsed.times[0];

      setTimes((prev) => {
        if (!prev.some((t) => t.time === null) || !first?.time) return prev;

        return prev.map((t, i) =>
          i === 0
            ? {
                ...t,
                time: first.time,
                repeat: first.repeat,
                date: first.date,
                fireCount: first.fireCount,
                fireIntervalSeconds: first.fireIntervalSeconds,
                repeatBurstDaily: first.repeatBurstDaily,
              }
            : t
        );
      });
    }, 400);

    return () => clearTimeout(timeout);
  }, [label]);

  const canSave = (label ?? '').trim().length > 0 && times.every((t) => t.time !== null);

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <ScrollView
        className="bg-background"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View className="flex-row items-center justify-between">
          <View className="mb-6 mt-2">
            <Text className="text-textPrimary text-xl font-black tracking-tight uppercase">{title}</Text>
            <Text className="text-textSecondary text-xs font-medium mt-0.5">
              Set your reminders to stay on track
            </Text>
          </View>

          <Pressable
            onPress={addTime}
            className="border-accent flex-row items-center gap-2 active:opacity-70  bg-cardBackground/70"

            style={{ padding: 8, borderWidth: 1, borderStyle: 'dashed', borderRadius: 8, alignItems: 'center', marginBottom: 12 }}
          >
            <Feather name="plus" size={11} color={colors.accent} />
            <Text className="text-accent font-extrabold text-xs" style={{ fontWeight: '600' }}>Add Time</Text>
          </Pressable>

        </View>

        <Text className="text-textSecondary text-[11px] font-bold tracking-widest uppercase mb-2">
          Label
        </Text>
        <View className="bg-cardBackground rounded-xl px-4 py-3.5 mb-6">
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="What should this remind you of?"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            style={{ fontSize: 13, color: colors.textPrimary, padding: 0 }}
          />
        </View>

        {times.map((t, i) => (
          <TimeCard
            key={i}
            time={t}
            index={i}
            timesCount={times.length}
            pickerOpen={pickerOpenIndex === i}
            colors={colors}
            onRemove={removeTime}
            onOpenPicker={openPicker}
            onClosePicker={closePicker}
            onUpdate={updateTime}
          />
        ))}

        <View className="flex-row gap-3">
          <Pressable
            onPress={onCancel}
            className="flex-1 bg-cardBackground/70 rounded-xl py-4 items-center active:opacity-70 border border-danger border-dashed"
          >
            <Text className="text-danger text-[12px] font-bold">Cancel</Text>
          </Pressable>
          <Pressable
            disabled={!canSave}
            onPress={() => onSave({ label: (label ?? '').trim(), times, needsEventClarification: false })}
            className={`flex-1 rounded-xl py-4 items-center ${canSave ? 'bg-accent active:opacity-80 border border-accent border-dashed' : 'bg-cardBackground/70 border border-textSecondary border-dashed'}`}
          >
            <Text className={`text-[12px] font-bold ${canSave ? 'text-white' : 'text-textMuted'}`}>
              Save Reminder
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
