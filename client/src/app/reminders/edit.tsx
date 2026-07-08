import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import ReminderDraftEditor from '@/components/reminder-ui/ReminderDraftEditor';
import { parseReminderInput, ensureParsedTimeDraft } from '@/domain/reminders/reminderParser';
import { getReminderById, createReminder, updateReminder } from '@/db/reminderRepo';
import type { ParsedReminderDraft } from '@/domain/reminders/types';
import ScreenContainer from '@/components/ScreenContainer';
import { useReminders } from '@/context/reminderContext';

const BLANK_DRAFT: ParsedReminderDraft = {
  label: '',
  times: [ensureParsedTimeDraft({})],
  needsEventClarification: false,
};

export default function EditReminderScreen() {
  const { createReminder, updateReminder } = useReminders();

  const { text, id } = useLocalSearchParams<{ text?: string; id?: string }>();
  const router = useRouter();
  const [draft, setDraft] = useState<ParsedReminderDraft | null>(null);

  useEffect(() => {
    if (id) {
      getReminderById(id).then((reminder) => {
        if (!reminder) { router.back(); return; }
        setDraft({
          label: reminder.label,
          times: reminder.times.map((t) =>
            ensureParsedTimeDraft({
              time: t.time,
              repeat: t.repeat,
              date: t.date,
              fireCount: t.fireCount,
              fireIntervalSeconds: t.fireIntervalSeconds,
              repeatBurstDaily: t.repeatBurstDaily,
              meridiemAmbiguous: false,
            }),
          ),
          needsEventClarification: false,
        });
      });
    } else if (text) {
      const parsed = parseReminderInput(text);
      setDraft({
        ...parsed,
        times: parsed.times.map(ensureParsedTimeDraft),
      });
    } else {
      setDraft(BLANK_DRAFT);
    }
  }, [id, text]);

  async function handleSave(finalDraft: ParsedReminderDraft) {
    if (id) {
      await updateReminder(id, finalDraft.label, finalDraft.times);
    } else {
      await createReminder(finalDraft.label, finalDraft.times);
    }
    router.push('/(tabs)/reminders');
  }

  if (!draft) {
    return <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator /></View>;
  }

  return (
    <ScreenContainer>
    <ReminderDraftEditor
      initialDraft={draft}
      title={id ? 'Edit Reminder' : 'New Reminder'}
      onSave={handleSave}
      onCancel={() => router.push('/(tabs)/reminders')}
    />
    </ScreenContainer>
  );
}