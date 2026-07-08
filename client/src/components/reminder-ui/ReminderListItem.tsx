import { useState } from 'react';
import { View, Text, Pressable, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import ConfirmModal from '@/components/ConfirmModal';
import type { Reminder } from '@/domain/reminders/types';
import { useReminders } from '@/context/reminderContext';
import SnoozePicker from './SnoozePicker';
function formatSubtitle(reminder: Reminder): string {
  if (reminder.times.length === 0) return 'No time set';
  const t = reminder.times[0];
  const timeLabel = t.time ?? '--:--';
  const extra = reminder.times.length > 1 ? ` +${reminder.times.length - 1} more` : '';
  return t.repeat === 'daily' ? `Daily · ${timeLabel}${extra}` : `Once · ${t.date ?? ''} ${timeLabel}${extra}`;
}

export default function ReminderListItem({ reminder }: { reminder: Reminder }) {
  const router = useRouter();
  const { toggleReminder, deleteReminder, snoozeReminder } = useReminders();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const hasTime = reminder.times.length > 0;
  const isDaily = hasTime && reminder.times[0].repeat === 'daily';

  return (
    <Pressable
      onPress={() => router.push({ pathname: '/reminders/edit', params: { id: reminder.id } })}
      className={`bg-cardBackground rounded-2xl mb-3 px-4 py-6 ${!reminder.enabled ? ' border border-dashed border-textMuted bg-gray-100' : ''
        }`}
      style={{
        shadowColor: '#0F172A',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: reminder.enabled ? 0.08 : 0.08,
        shadowRadius: 16,
        elevation: reminder.enabled ? 3 : 3,
      }}
    >
      {/* Header row: label + master switch */}
      <View className="flex-row items-center justify-between">
        <Pressable
          className="flex-1 pr-3 active:opacity-60"
        >
          <View className="flex-row items-center gap-1.5"
          >
            <View className="w-1 h-4 bg-accent "></View>
            <Text
              className={`text-[13px] font-bold tracking-tight ${!reminder.enabled ? 'text-textMuted line-through' : 'text-textPrimary'
                }`}
              numberOfLines={1}
            >
              {reminder.label}
            </Text>

          </View>

        </Pressable>

        <Switch
          value={reminder.enabled}
          onValueChange={(val) => void toggleReminder(reminder.id, val)}

          trackColor={{ false: !reminder.enabled ? 'rgba(182, 178, 178, 0.97)' : 'rgba(0,0,0,0.1)', true: '#059669' }}
          thumbColor="#ffffff"
          ios_backgroundColor="#E2E5EA"
        />

      </View>

      {/* Metadata pill — soft filled chip instead of plain uppercase text */}
      <Pressable
        onPress={() => router.push({ pathname: '/reminders/edit', params: { id: reminder.id } })}
        className="flex-row items-center self-start mt-2.5 bg-cardBackground rounded-full pl-2.5 pr-3 py-1 active:opacity-70  border border-dashed border-textSecondary"
      >
        <Feather
          name={!hasTime ? 'clock' : isDaily ? 'refresh-cw' : 'calendar'}
          size={11}
          color="#8A8F98"
        />
        <Text className={`${!reminder.enabled ? 'text-textSecondary line-through' : 'text-accent'} text-[11px] font-semibold ml-1.5 tracking-wide`}>
          {formatSubtitle(reminder)}
        </Text>
      </Pressable>

      {/* Action deck — separated by spacing + a hairline divider instead of a border box */}
      <View className="flex-row items-center mt-4 pt-3.5" style={{ borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.05)' }}>
        {reminder.enabled ? <SnoozePicker onSnooze={(minutes) => snoozeReminder(reminder.label, minutes)} /> : <Text className="line-through text-textSecondary text-[11px] font-semibold ml-1.5 tracking-wide">Snooze</Text>}

        <View className="flex-1" />

        <Pressable
          onPress={() => setShowDeleteConfirm(true)}
          className={`border border-dashed border-red-700 flex-row items-center gap-1.5 active:opacity-60 ${reminder.enabled ? '' : 'bg-cardBackground'} px-3 py-1.5 rounded-xl`}
        >
          <Feather name="trash-2" size={11} color="#DC2626" />
          <Text className="text-danger font-bold text-[10px] tracking-wide">
            Delete
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
        />      </View>
    </Pressable>
  );
}