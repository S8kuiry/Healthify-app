import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Switch,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Feather } from '@expo/vector-icons';
import { useAppColors } from '@/hooks/use-app-colors';
import { AppColors } from '@/constants/appColors';
import { parseReminderInput, ensureParsedTimeDraft } from '@/domain/reminders/reminderParser';
import { generateFrequencyTimes } from '@/domain/reminders/reminderFrequency';
import { getAssistantState, QUICK_TIME_PHRASES } from '@/domain/reminders/reminderAssistant';
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
  onTimeManualPick: () => void;
};

const BLANK_TIME: ParsedTimeDraft = ensureParsedTimeDraft({});
const MAX_TIMES_PER_DAY = 12;

function mergeParsedTime(
  current: ParsedTimeDraft,
  parsed: ParsedTimeDraft,
  userPickedTime: boolean,
): ParsedTimeDraft {
  const next = { ...current, meridiemAmbiguous: parsed.meridiemAmbiguous };

  const shouldApplyTime =
    parsed.time &&
    !userPickedTime &&
    (current.time === null ||
      parsed.meridiemAmbiguous !== current.meridiemAmbiguous ||
      parsed.time !== current.time);

  if (shouldApplyTime) {
    next.time = parsed.time;
    next.repeat = parsed.repeat;
    next.date = parsed.date;
    next.meridiemAmbiguous = parsed.meridiemAmbiguous;
  }

  return next;
}

function normalizeTimesForSave(times: ParsedTimeDraft[]): ParsedTimeDraft[] {
  return times.map((t) => ensureParsedTimeDraft({ ...t, meridiemAmbiguous: false }));
}

/** "14:05" -> { time: "2:05", period: "PM" } for a large clock-style display. */
function splitTime12h(time24: string): { time: string; period: string } {
  const [h, m] = time24.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return { time: time24, period: '' };
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return { time: `${hour12}:${String(m).padStart(2, '0')}`, period };
}

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
  onTimeManualPick,
}: TimeCardProps) {
  const isDaily = t.repeat === 'daily';
  const display = t.time ? splitTime12h(t.time) : null;

  return (
    <View className="flex-row mb-3 rounded-2xl overflow-hidden bg-cardBackground">
      {/* Left accent rail — solid when a time is set, muted otherwise. */}
      <View className={`w-1.5 ${t.time ? 'bg-accent' : 'bg-backgroundElement/50'}`} />

      <View className="flex-1 p-4">
        <View className="flex-row items-center justify-between mb-3">
          <View className="flex-row items-center gap-2.5">
            <View
              className={`h-6 w-6 rounded-full items-center justify-center ${
                t.time ? 'bg-accent/15' : 'bg-backgroundElement/40'
              }`}
            >
              <Text className={`text-[11px] font-black ${t.time ? 'text-accent' : 'text-textMuted'}`}>
                {i + 1}
              </Text>
            </View>
            <Text className="text-textSecondary text-[11px] font-bold tracking-widest uppercase">
              {timesCount > 1 ? `Time ${i + 1}` : 'Time'}
            </Text>
          </View>

          {timesCount > 1 && (
            <Pressable
              onPress={() => onRemove(i)}
              hitSlop={8}
              className="h-7 w-7 rounded-full items-center justify-center bg-danger/10 active:opacity-60"
            >
              <Feather name="trash-2" size={13} color={colors.danger} />
            </Pressable>
          )}
        </View>

        {/* Big, tappable clock display. */}
        <Pressable
          onPress={() => onOpenPicker(i)}
          className={`flex-row items-center justify-between rounded-[10px] px-4 py-1 active:opacity-70 border border-dashed  ${
            t.time ? ' border-accent' : 'bg-backgroundElement/20 border-dashed border-accent/60'
          }`}
        >
          {display ? (
            <View className="flex-row items-baseline">
              <Text className="text-textPrimary text-[12px] font-black tracking-tight">
                {display.time}
              </Text>
              <Text className="text-accent text-[11px] font-black ml-1.5">{display.period}</Text>
            </View>
          ) : (
            <Text className="text-textSecondary text-[12px] font-bold">
              No time set — tap to choose
            </Text>
          )}
          <View
            className={`h-8 w-8 rounded-full items-center justify-center ${
              t.time ? 'bg-accent/15' : 'bg-accent/10'
            }`}
          >
            <Feather name="clock" size={11} color={t.time ? colors.accent : colors.textMuted} />
          </View>
        </Pressable>

        {pickerOpen && (
          <DateTimePicker
            mode="time"
            value={t.time ? new Date(`2000-01-01T${t.time}:00`) : new Date()}
            onChange={(_, selectedDate) => {
              onClosePicker();
              if (selectedDate) {
                onTimeManualPick();
                const hh = String(selectedDate.getHours()).padStart(2, '0');
                const mm = String(selectedDate.getMinutes()).padStart(2, '0');
                onUpdate(i, { time: `${hh}:${mm}`, meridiemAmbiguous: false });
              }
            }}
          />
        )}

        {/* Divider + repeat row. */}
        <View className="h-px bg-backgroundElement/30 my-3.5" />

        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Feather name="refresh-cw" size={13} color={isDaily ? colors.accent : colors.textSecondary} />
            <View>
              <Text className="text-textPrimary text-[13px] font-semibold">Repeat daily</Text>
              <Text className="text-textMuted text-[10px] mt-0.5">
                {isDaily ? 'Rings every day' : 'One time only'}
              </Text>
            </View>
          </View>
          <Switch
            value={isDaily}
            onValueChange={(val) => onUpdate(i, { repeat: val ? 'daily' : 'once' })}
            trackColor={{ false: colors.backgroundElement, true: colors.accent }}
            thumbColor="#ffffff"
          />
        </View>
      </View>
    </View>
  );
});

export default function ReminderDraftEditor({ initialDraft, title, onSave, onCancel }: Props) {
  const colors = useAppColors();

  const [label, setLabel] = useState(initialDraft.label ?? '');

  const [times, setTimes] = useState<ParsedTimeDraft[]>(() =>
    (initialDraft.times?.length ? initialDraft.times : [BLANK_TIME]).map(ensureParsedTimeDraft),
  );

  const [pickerOpenIndex, setPickerOpenIndex] = useState<number | null>(null);

  // The dismissable "these are auto-spread slots" note. Shown only when there
  // are multiple times AND the user hasn't crossed it off.
  const [spreadNoteDismissed, setSpreadNoteDismissed] = useState(false);

  // Seed as "already picked" when the loaded reminder has a stored time, so the
  // auto-parse effect can't re-derive a time from the label's wording (e.g.
  // "Drink water at 7:05 pm") and silently overwrite the real saved time.
  const userPickedTimeRef = useRef(Boolean(initialDraft.times?.[0]?.time));

  // "Times per day" is derived from the number of cards — the cards are the
  // single source of truth (manual Add/Remove changes this number too).
  const timesPerDay = times.length;

  const addTime = useCallback(() => {
    setTimes((prev) => [...prev, { ...BLANK_TIME }]);
  }, []);

  const removeTime = useCallback((index: number) => {
    setTimes((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  }, []);

  const updateTime = useCallback((index: number, patch: Partial<ParsedTimeDraft>) => {
    setTimes((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));
  }, []);

  // Setting the count regenerates N slots spaced 2h apart from the first card's
  // start time (or ~1h from now if it has none). All slots stay editable.
  const setTimesPerDay = useCallback((n: number) => {
    const count = Math.min(Math.max(n, 1), MAX_TIMES_PER_DAY);
    setTimes((prev) => {
      const first = prev[0] ?? BLANK_TIME;
      if (count === 1) {
        return [ensureParsedTimeDraft({ ...first })];
      }
      const spread = generateFrequencyTimes(count, first.time);
      return spread.map((time, i) =>
        ensureParsedTimeDraft({
          time,
          // Keep the first card's repeat choice; spread slots default to daily.
          repeat: i === 0 ? (first.repeat === 'once' ? 'once' : 'daily') : 'daily',
          date: i === 0 ? first.date : null,
          meridiemAmbiguous: false,
        }),
      );
    });
    userPickedTimeRef.current = true; // regenerated times are intentional
    setSpreadNoteDismissed(false); // resurface the helper note on regeneration
  }, []);

  const openPicker = useCallback((index: number) => setPickerOpenIndex(index), []);
  const closePicker = useCallback(() => setPickerOpenIndex(null), []);
  const markTimeManualPick = useCallback(() => {
    userPickedTimeRef.current = true;
  }, []);

  const applyQuickPhrase = useCallback((phrase: string) => {
    const parsed = parseReminderInput(phrase).times[0];
    if (!parsed?.time) return;
    userPickedTimeRef.current = true;
    setTimes((prev) =>
      prev.map((t, i) =>
        i === 0
          ? ensureParsedTimeDraft({
            ...mergeParsedTime(t, parsed, false),
            meridiemAmbiguous: false,
          })
          : t,
      ),
    );
  }, []);

  // Auto-extract time / frequency from natural language in the label. If the
  // parser produced multiple times ("N times a day"), adopt the whole set.
  useEffect(() => {
    const trimmed = (label ?? '').trim();
    if (!trimmed) return;

    const timeout = setTimeout(() => {
      const parsed = parseReminderInput(trimmed);

      if (parsed.times.length > 1 && !userPickedTimeRef.current) {
        setTimes(parsed.times.map(ensureParsedTimeDraft));
        return;
      }

      const first = parsed.times[0];
      if (!first) return;
      setTimes((prev) =>
        prev.map((t, i) => (i === 0 ? mergeParsedTime(t, first, userPickedTimeRef.current) : t)),
      );
    }, 400);

    return () => clearTimeout(timeout);
  }, [label]);

  const assistant = useMemo(() => getAssistantState(label ?? '', times), [label, times]);
  const canSave = assistant.ready;

  const showQuickChips =
    (label ?? '').trim().length > 0 &&
    times.some((t) => t.time === null) &&
    !times.some((t) => t.meridiemAmbiguous);

  const showSpreadNote = timesPerDay > 1 && !spreadNoteDismissed;

  const confirmMeridiem = useCallback(
    (time: string) => {
      userPickedTimeRef.current = true;
      updateTime(0, { time, meridiemAmbiguous: false });
    },
    [updateTime],
  );

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
        <View className="flex-row items-center justify-start">
          <View className="mb-6 mt-2">
            <Text className="text-textPrimary text-xl font-black tracking-tight uppercase">{title}</Text>
            <Text className="text-textSecondary text-xs font-medium mt-0.5">
              Set your reminders to stay on track
            </Text>
          </View>

          {/* <Pressable
            onPress={addTime}
            className="border-accent flex-row items-center gap-2 active:opacity-70 bg-cardBackground/70"
            style={{
              padding: 8,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderRadius: 8,
              alignItems: 'center',
              marginBottom: 12,
            }}
          >
            <Feather name="plus" size={11} color={colors.accent} />
            <Text className="text-accent font-extrabold text-xs" style={{ fontWeight: '600' }}>
              Add Time
            </Text>
          </Pressable> */}
        </View>

        <Text className="text-textSecondary text-[11px] font-bold tracking-widest uppercase mb-2">
          Label
        </Text>
        <View className="bg-cardBackground rounded-xl px-4 py-3.5 mb-3">
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="What should this remind you of?"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            style={{ fontSize: 13, color: colors.textPrimary, padding: 0 }}
          />
        </View>

        {/* Event-level "Times per day" — one control for the whole reminder. */}
        <Text className="text-textSecondary text-[11px] font-bold tracking-widest uppercase mb-2">
          Times per day
        </Text>
        <View className="bg-cardBackground rounded-xl px-4 py-3 mb-2 flex-row items-center justify-between">
          <View className="flex-row items-center gap-2 flex-1 pr-3">
            <Feather name="repeat" size={14} color={colors.textSecondary} />
            <Text className="text-textPrimary text-[13px] font-semibold">
              How many times a day?
            </Text>
          </View>
          <View className="flex-row items-center gap-3">
            <Pressable
              onPress={() => setTimesPerDay(timesPerDay - 1)}
              disabled={timesPerDay <= 1}
              className={`h-8 w-8 rounded-xl items-center justify-center ${timesPerDay <= 1 ? 'bg-backgroundElement/30' : 'bg-backgroundElement/60 active:opacity-70'
                }`}
            >
              <Feather name="minus" size={11} color={timesPerDay <= 1 ? colors.textMuted : colors.textPrimary} />
            </Pressable>

            <Text className="text-textPrimary text-[13px] font-black w-6 text-center">{timesPerDay}</Text>

            <Pressable
              onPress={() => setTimesPerDay(timesPerDay + 1)}
              disabled={timesPerDay >= MAX_TIMES_PER_DAY}
              className={`h-8 w-8 rounded-xl items-center justify-center ${timesPerDay >= MAX_TIMES_PER_DAY
                  ? 'bg-backgroundElement/30'
                  : 'bg-accent/20 active:opacity-70'
                }`}
            >
              <Feather
                name="plus"
                size={11}
                color={timesPerDay >= MAX_TIMES_PER_DAY ? colors.textMuted : colors.accent}
              />
            </Pressable>
          </View>
        </View>

        {/* Permanent explainer so users don't confuse this with the old pop count. */}
        <Text className="text-textSecondary text-[11px] leading-4 mb-3 px-1">
          Sets how many evenly-spaced times a day this reminder rings. Each ring keeps
          going until you dismiss it.
        </Text>

        {/* Dismissable note about the auto-generated slots (only when count > 1). */}
        {showSpreadNote && (
          <View className="flex-row items-start gap-2 rounded-xl px-3 py-2.5 mb-3 bg-accent/10 border border-accent/25">
            <Feather name="info" size={13} color={colors.accent} style={{ marginTop: 1 }} />
            <Text className="flex-1 text-textSecondary text-[11px] leading-4">
              These are default times spread from your start time — tap any card to
              edit it to whatever you like.
            </Text>
            <Pressable onPress={() => setSpreadNoteDismissed(true)} className="active:opacity-60 p-0.5">
              <Feather name="x" size={13} color={colors.textMuted} />
            </Pressable>
          </View>
        )}


        {assistant.ready &&
          <View
            className={`rounded-xl px-4 py-3 mb-3 border ${assistant.ready ? 'bg-accent/10 border-accent/30' : 'bg-cardBackground border-backgroundElement/60'
              }`}
          >
            <View className="flex-row items-start gap-2">
              <Feather
                name={assistant.ready ? 'check-circle' : 'message-circle'}
                size={14}
                color={assistant.ready ? colors.accent : colors.textSecondary}
                style={{ marginTop: 1 }}
              />
              <View className="flex-1">
                {assistant.preview && (
                  <Text className="text-textPrimary text-[12px] font-semibold mb-1 leading-5">
                    {assistant.preview}
                  </Text>
                )}
                <Text
                  className={`text-[11px] leading-5 ${assistant.ready ? 'text-accent font-semibold' : 'text-textSecondary'
                    }`}
                >
                  {assistant.message}
                </Text>
                {assistant.clarification?.kind === 'ambiguous_meridiem' && (
                  <View className="flex-row flex-wrap gap-2 mt-2">
                    <Pressable
                      onPress={() => confirmMeridiem(assistant.clarification!.amTime)}
                      className="bg-backgroundElement/50 border border-accent/25 rounded-full px-3 py-1.5 active:opacity-70"
                    >
                      <Text className="text-accent text-[11px] font-bold">{assistant.clarification.amLabel}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => confirmMeridiem(assistant.clarification!.pmTime)}
                      className="bg-backgroundElement/50 border border-accent/25 rounded-full px-3 py-1.5 active:opacity-70"
                    >
                      <Text className="text-accent text-[11px] font-bold">{assistant.clarification.pmLabel}</Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </View>
          </View>

        }

        {showQuickChips && (
          <View className="flex-row flex-wrap gap-2 mb-4">
            {QUICK_TIME_PHRASES.map((chip) => (
              <Pressable
                key={chip.label}
                onPress={() => applyQuickPhrase(chip.phrase)}
                className="bg-cardBackground border border-dashed border-accent/80 rounded-full px-3 py-1.5 active:opacity-70"
              >
                <Text className="text-accent/80 text-[11px] font-bold">{chip.label}</Text>
              </Pressable>
            ))}
          </View>
        )}

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
            onTimeManualPick={markTimeManualPick}
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
            onPress={() => {
              const trimmed = (label ?? '').trim();
              const cleanLabel = parseReminderInput(trimmed).label || trimmed;
              onSave({
                label: cleanLabel,
                times: normalizeTimesForSave(times),
                needsEventClarification: false,
              });
            }}
            className={`flex-1 rounded-xl py-4 items-center ${canSave
                ? 'bg-accent active:opacity-80 border border-accent border-dashed'
                : 'bg-cardBackground/70 border border-textSecondary border-dashed'
              }`}
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
