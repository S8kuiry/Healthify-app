import { useState } from 'react';
import { View, Text, Pressable, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import ConfirmModal from '@/components/ConfirmModal';
import type { Reminder } from '@/domain/reminders/types';
import { useReminders } from '@/context/reminderContext';
import { useAppColors } from '@/hooks/use-app-colors';

const MONO = 'Courier New';

function formatSubtitle(reminder: Reminder): string {
  if (reminder.times.length === 0) return 'NO_TIME_SET';
  const t = reminder.times[0];
  const timeLabel = t.time ?? '--:--';
  const extra = reminder.times.length > 1 ? ` +${reminder.times.length - 1}` : '';
  return t.repeat === 'daily'
    ? `DAILY · ${timeLabel}${extra}`
    : `ONCE · ${t.date ?? ''} ${timeLabel}${extra}`;
}

function idTag(id: string): string {
  return `#${id.replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

// function CornerBracket({
//   position,
//   color,
// }: {
//   position: 'tl' | 'tr' | 'bl' | 'br';
//   color: string;
// }) {
//   const vertical = position.includes('t') ? 'top-1.5' : 'bottom-1.5';
//   const horizontal = position.includes('l') ? 'left-1.5' : 'right-1.5';
//   const borderStyle = {
//     borderColor: color,
//     borderTopWidth: position.includes('t') ? 1.5 : 0,
//     borderBottomWidth: position.includes('b') ? 1.5 : 0,
//     borderLeftWidth: position.includes('l') ? 1.5 : 0,
//     borderRightWidth: position.includes('r') ? 1.5 : 0,
//   };
//   return (
//     <View
//       className={`absolute ${vertical} ${horizontal} w-3 h-3 z-10 rounded-sm`}
//       style={borderStyle}
//       pointerEvents="none"
//     />
//   );
// }

export default function ReminderListItem({ reminder }: { reminder: Reminder }) {
  const router = useRouter();
  const colors = useAppColors();
  const { toggleReminder, deleteReminder } = useReminders();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const hasTime = reminder.times.length > 0;
  const isDaily = hasTime && reminder.times[0].repeat === 'daily';
  const enabled = reminder.enabled;

  const goToEdit = () =>
    router.push({ pathname: '/reminders/edit', params: { id: reminder.id } });

  return (
    <Pressable
      onPress={goToEdit}
      className="flex-row mb-3 rounded-xl overflow-hidden bg-cardBackground active:opacity-90 shadow-lg shadow-black/10 border border-accent border-dashed"
      style={{
        elevation: 3,
        borderWidth: 1,
        borderColor: enabled ? `${colors.accent}33` : `${colors.backgroundElement}66`,
      }}
    >
      {/* <CornerBracket position="tl" color={enabled ? colors.accent : colors.textMuted} />
      <CornerBracket position="br" color={enabled ? colors.accent : colors.textMuted} /> */}

      {/* Left accent rail — solid when enabled, muted otherwise. */}
      <View
        className={` ${enabled ? 'bg-accent' : 'bg-backgroundElement/50'}`}
        style={
          enabled
            ? { shadowColor: colors.accent, shadowOpacity: 0.6, shadowRadius: 6, shadowOffset: { width: 1, height: 0 } }
            : undefined
        }
      />

      <View className="flex-1 p-4">
        {/* Header row: badge + label + master switch */}
        <View className="flex-row items-center justify-between mb-1  ">
          <View className='w-1 h-4 bg-accent mr-2'></View>


          <View className="flex-row items-center gap-2 flex-1 pr-3">
            <View
              className={`h-6 w-6 rounded-[10px] items-center justify-center ${enabled ? 'bg-accent/15' : 'bg-backgroundElement/40'
                }`}
              style={[
                { borderWidth: 1, borderColor: enabled ? `${colors.accent}55` : 'transparent' },
                enabled
                  ? {
                    shadowColor: colors.accent,
                    shadowOpacity: 0.35,
                    shadowRadius: 4,
                    shadowOffset: { width: 0, height: 1 },
                  }
                  : undefined,
              ]}
            >
              <Feather
                name="bell"
                size={11}
                color={enabled ? colors.accent : colors.textMuted}
              />
            </View>
            <Text
              className={`flex-1 text-[11px] font-bold uppercase tracking-wider ${enabled ? 'text-textPrimary' : 'text-textMuted line-through'
                }`}
              style={{ fontFamily: MONO }}
              numberOfLines={1}
            >
              {reminder.label}
            </Text>
          </View>

          <Switch
            value={enabled}
            onValueChange={(val) => void toggleReminder(reminder.id, val)}
            trackColor={{ false: colors.backgroundElement, true: colors.accent }}
            thumbColor="#ffffff"
            ios_backgroundColor={colors.backgroundElement}
            style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }] }}
          />
        </View>

        {/* Technical readout strip: id tag + status word, terminal-style */}
        <View className="flex-row items-center justify-between mb-2 mt-1">
          <Text
            className="text-[9px] tracking-widest text-textMuted"
            style={{ fontFamily: MONO }}
          >
            {idTag(reminder.id)}
          </Text>
          <Text
            className={`text-[9px] font-bold tracking-widest ${enabled ? 'text-accent' : 'text-textMuted'
              }`}
            style={{ fontFamily: MONO }}
          >
            {enabled ? '[ ACTIVE ]' : '[ IDLE ]'}
          </Text>
        </View>

        {/* Metadata pill — soft filled chip mirroring the TimeCard clock display. */}
        <Pressable
          onPress={goToEdit}
          className={` flex-row items-center self-start rounded-md px-2.5 py-1.5 mb-1 active:opacity-70 ${hasTime
              ? 'bg-accent/5 shadow-sm shadow-accent/20 border '
              : 'bg-backgroundElement/20 border border-dashed border-accent/60'
            }`}
          style={hasTime ? { borderWidth: 1, borderColor: `${colors.accent}22` } : undefined}
        >
          <Feather
            name={!hasTime ? 'clock' : isDaily ? 'refresh-cw' : 'calendar'}
            size={10}
            color={enabled ? colors.textSecondary : colors.textSecondary}
          />
          <Text
            className={`text-[9px] font-bold ml-1.5 tracking-widest ${enabled ? 'text-accent' : 'text-textSecondary line-through'
              }`}
            style={{ fontFamily: MONO }}
          >
            {formatSubtitle(reminder)}
          </Text>
        </Pressable>

        {/* Divider + action deck — dashed scan-line instead of a solid rule. */}
        <View
          className="my-3"
          style={{ borderTopWidth: 1, borderStyle: 'dashed', borderColor: `${colors.textMuted}37` }}
        />

        <View className="flex-row items-center">
          <View className="flex-1" />

          <Pressable
            onPress={() => setShowDeleteConfirm(true)}
            hitSlop={6}
            className="flex-row items-center gap-1.5 rounded-md px-2.5 py-1.5 bg-danger/10 active:opacity-60 shadow-sm shadow-danger/20"
            style={{ borderWidth: 1, borderColor: `${colors.danger}33` }}
          >
            <Feather name="trash-2" size={11} color={colors.danger} />
            <Text
              className="text-danger font-bold text-[9px] tracking-widest"
              style={{ fontFamily: MONO }}
            >
              DELETE
            </Text>
          </Pressable>

          <ConfirmModal
            visible={showDeleteConfirm}
            title="Delete reminder?"
            message={`Remove "${reminder.label}"? This cannot be undone.`}
            confirmLabel="Delete"
            onClose={() => setShowDeleteConfirm(false)}
            onConfirm={() => {
              void deleteReminder(reminder.id);
              setShowDeleteConfirm(false);
            }}
          />
        </View>
      </View>


    </Pressable>
  );
}