import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { View, Text, TextInput, Pressable, Switch, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';

import DateTimePicker from '@react-native-community/datetimepicker';

import { Feather } from '@expo/vector-icons';

import { useAppColors } from '@/hooks/use-app-colors';

import { AppColors } from '@/constants/appColors';

import { parseReminderInput, ensureParsedTimeDraft } from '@/domain/reminders/reminderParser';

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

  onFireCountManualEdit: () => void;

  onTimeManualPick: () => void;

};



const BLANK_TIME: ParsedTimeDraft = ensureParsedTimeDraft({});



function mergeParsedTime(
  current: ParsedTimeDraft,
  parsed: ParsedTimeDraft,
  manualFireCount: boolean,
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
    next.fireIntervalSeconds = parsed.fireIntervalSeconds;
    next.meridiemAmbiguous = parsed.meridiemAmbiguous;
  }

  if (!manualFireCount && parsed.fireCount > 1) {
    next.fireCount = parsed.fireCount;
    next.repeatBurstDaily = parsed.repeatBurstDaily;
  }

  if (next.repeat === 'daily' && next.fireCount > 1) {
    next.repeatBurstDaily = next.repeatBurstDaily !== false;
  }

  return next;
}



function normalizeTimesForSave(times: ParsedTimeDraft[]): ParsedTimeDraft[] {
  return times.map((t) =>
    ensureParsedTimeDraft({
      ...t,
      meridiemAmbiguous: false,
      repeatBurstDaily: t.repeat === 'daily' && t.fireCount > 1 ? t.repeatBurstDaily !== false : t.repeatBurstDaily,
    }),
  );
}

function clampFireCount(raw: string): number {
  return Math.min(Math.max(parseInt(raw, 10) || 1, 1), 5);
}

function PopCountInput({
  fireCount,
  colors,
  onManualEdit,
  onCommit,
}: {
  fireCount: number;
  colors: ColorSet;
  onManualEdit: () => void;
  onCommit: (n: number) => void;
}) {
  const [text, setText] = useState(String(fireCount));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(fireCount));
  }, [fireCount]);

  const commit = useCallback(() => {
    const n = clampFireCount(text);
    setText(String(n));
    onManualEdit();
    onCommit(n);
  }, [text, onManualEdit, onCommit]);

  return (
    <TextInput
      keyboardType="number-pad"
      selectTextOnFocus
      value={text}
      onFocus={() => setFocused(true)}
      onChangeText={(val) => {
        onManualEdit();
        const cleaned = val.replace(/\D/g, '');
        setText(cleaned);
        onCommit(cleaned ? clampFireCount(cleaned) : 1);
      }}
      onBlur={() => {
        setFocused(false);
        commit();
      }}
      onSubmitEditing={commit}
      style={{
        fontSize: 11,
        fontWeight: '700',
        color: colors.textPrimary,
        padding: 0,
        textAlign: 'center',
      }}
    />
  );
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

  onFireCountManualEdit,

  onTimeManualPick,

}: TimeCardProps) {

  return (

    <View className="bg-cardBackground rounded-2xl p-4 mb-3">

      <View className="flex-row items-center justify-between mb-3 bg">

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

        className="flex-row items-center bg-cardBackground border border-dashed border-accent rounded-2xl px-4 py-3.5 active:opacity-70"

      >

        <Feather name="clock" size={13} color={t.time ? colors.accent : colors.textMuted} />

        <Text

          className={`text-[12px] font-bold ml-2.5 ${t.time ? 'text-textPrimary' : 'text-textSecondary'}`}

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

              onTimeManualPick();

              const hh = String(selectedDate.getHours()).padStart(2, '0');

              const mm = String(selectedDate.getMinutes()).padStart(2, '0');

              onUpdate(i, { time: `${hh}:${mm}`, meridiemAmbiguous: false });

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

          onValueChange={(val) => {

            const repeat = val ? 'daily' : 'once';

            onUpdate(i, {

              repeat,

              repeatBurstDaily: repeat === 'daily' && t.fireCount > 1 ? true : t.repeatBurstDaily,

            });

          }}

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

          <PopCountInput

            fireCount={t.fireCount}

            colors={colors}

            onManualEdit={onFireCountManualEdit}

            onCommit={(n) =>

              onUpdate(i, {

                fireCount: n,

                repeatBurstDaily: t.repeat === 'daily' && n > 1 ? true : t.repeatBurstDaily,

              })

            }

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

  const [times, setTimes] = useState<ParsedTimeDraft[]>(() =>
    (initialDraft.times?.length ? initialDraft.times : [BLANK_TIME]).map(ensureParsedTimeDraft),
  );

  const [pickerOpenIndex, setPickerOpenIndex] = useState<number | null>(null);

  const manualFireCountRef = useRef(false);

  // Seed as "already picked" when the loaded reminder has a stored time, so the
  // auto-parse effect can't re-derive a time from the label's wording (e.g.
  // "Drink water at 7:05 pm") and silently overwrite the real saved time.
  const userPickedTimeRef = useRef(Boolean(initialDraft.times?.[0]?.time));



  const addTime = useCallback(() => {

    setTimes((prev) => [...prev, { ...BLANK_TIME }]);

  }, []);



  const removeTime = useCallback((index: number) => {

    setTimes((prev) => prev.filter((_, i) => i !== index));

  }, []);



  const updateTime = useCallback((index: number, patch: Partial<ParsedTimeDraft>) => {

    setTimes((prev) => prev.map((t, i) => (i === index ? { ...t, ...patch } : t)));

  }, []);



  const markFireCountManual = useCallback(() => {

    manualFireCountRef.current = true;

  }, []);



  const openPicker = useCallback((index: number) => {

    setPickerOpenIndex(index);

  }, []);



  const closePicker = useCallback(() => {

    setPickerOpenIndex(null);

  }, []);



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

              ...mergeParsedTime(t, parsed, manualFireCountRef.current, false),

              meridiemAmbiguous: false,

            })

          : t

      )

    );

  }, []);



  // Auto-extract time / pop count from natural language in the label.

  useEffect(() => {

    const trimmed = (label ?? '').trim();

    if (!trimmed) return;



    const timeout = setTimeout(() => {

      const parsed = parseReminderInput(trimmed);

      const first = parsed.times[0];

      if (!first) return;



      setTimes((prev) =>

        prev.map((t, i) =>

          i === 0 ? mergeParsedTime(t, first, manualFireCountRef.current, userPickedTimeRef.current) : t,

        ),

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



  const confirmMeridiem = useCallback((time: string) => {

    userPickedTimeRef.current = true;

    updateTime(0, { time, meridiemAmbiguous: false });

  }, [updateTime]);



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



        <View

          className={`rounded-xl px-4 py-3 mb-3 border ${

            assistant.ready ? 'bg-accent/10 border-accent/30' : 'bg-cardBackground border-backgroundElement/60'

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

                className={`text-[11px] leading-5 ${

                  assistant.ready ? 'text-accent font-semibold' : 'text-textSecondary'

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



        {showQuickChips && (

          <View className="flex-row flex-wrap gap-2 mb-4">

            {QUICK_TIME_PHRASES.map((chip) => (

              <Pressable

                key={chip.label}

                onPress={() => applyQuickPhrase(chip.phrase)}

                className="bg-cardBackground  border  border-dashed border-accent/80 rounded-full px-3 py-1.5 active:opacity-70"

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

            onFireCountManualEdit={markFireCountManual}

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


