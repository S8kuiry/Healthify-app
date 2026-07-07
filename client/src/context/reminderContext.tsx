import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import * as Notifications from 'expo-notifications';
import {
  getAllReminders,
  createReminder as repoCreate,
  updateReminder as repoUpdate,
  toggleReminder as repoToggle,
  deleteReminder as repoDelete,
  rescheduleAllReminders,
} from '@/db/reminderRepo';
import { snoozeNotification, ensureReminderChannel } from '@/services/reminderScheduler';
import type { Reminder, ParsedTimeDraft } from '@/domain/reminders/types';
import { MOCK_REMINDERS } from '@/test/mock';
import { useProfile } from '@/context/profileContext';

type ReminderContextValue = {
  reminders: Reminder[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  createReminder: (label: string, times: ParsedTimeDraft[]) => Promise<void>;
  updateReminder: (id: string, label: string, times: ParsedTimeDraft[]) => Promise<void>;
  toggleReminder: (id: string, enabled: boolean) => Promise<void>;
  deleteReminder: (id: string) => Promise<void>;
  snoozeReminder: (label: string, delayMinutes: number) => Promise<void>;
};

const ReminderContext = createContext<ReminderContextValue | null>(null);

/** Dev-only mock rows use ids like rem-001 — not in SQLite. */
function isMockReminderId(id: string): boolean {
  return __DEV__ && id.startsWith('rem-');
}

export function ReminderProvider({ children }: { children: ReactNode }) {
  const { dbReady } = useProfile();
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async () => {
    const rows = await getAllReminders();
    if (rows.length > 0) {
      setReminders(rows);
      return;
    }
    // Empty DB: show mock list in dev for UI work; production stays empty.
    setReminders([]);
  }, []);

  useEffect(() => {
    if (!dbReady) return;

    let cancelled = false;

    (async () => {
      try {
        await ensureReminderChannel();
        await Notifications.requestPermissionsAsync();
        await rescheduleAllReminders();
      } catch (err) {
        console.warn('[ReminderProvider] notification setup failed:', err);
      }

      if (cancelled) return;

      try {
        await refresh();
      } catch (err) {
        console.warn('[ReminderProvider] refresh failed:', err);
        if (!cancelled) setReminders(__DEV__ ? MOCK_REMINDERS : []);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [dbReady, refresh]);

  const createReminder = useCallback(async (label: string, times: ParsedTimeDraft[]) => {
    await repoCreate(label, times);
    await refresh();
  }, [refresh]);

  const updateReminder = useCallback(async (id: string, label: string, times: ParsedTimeDraft[]) => {
    await repoUpdate(id, label, times);
    await refresh();
  }, [refresh]);

  const toggleReminder = useCallback(async (id: string, enabled: boolean) => {
    if (isMockReminderId(id)) {
      setReminders((prev) => prev.map((r) => (r.id === id ? { ...r, enabled } : r)));
      return;
    }
    try {
      await repoToggle(id, enabled);
      await refresh();
    } catch (err) {
      console.warn('[ReminderProvider] toggle failed:', err);
    }
  }, [refresh]);

  const deleteReminder = useCallback(async (id: string) => {
    if (isMockReminderId(id)) {
      setReminders((prev) => prev.filter((r) => r.id !== id));
      return;
    }
    try {
      await repoDelete(id);
      await refresh();
    } catch (err) {
      console.warn('[ReminderProvider] delete failed:', err);
    }
  }, [refresh]);

  const snoozeReminder = useCallback(async (label: string, delayMinutes: number) => {
    try {
      await snoozeNotification(label, delayMinutes);
    } catch (err) {
      console.warn('[ReminderProvider] snooze failed:', err);
    }
  }, []);

  return (
    <ReminderContext.Provider
      value={{ reminders, isLoading, refresh, createReminder, updateReminder, toggleReminder, deleteReminder, snoozeReminder }}
    >
      {children}
    </ReminderContext.Provider>
  );
}

export function useReminders() {
  const ctx = useContext(ReminderContext);
  if (!ctx) throw new Error('useReminders must be used inside ReminderProvider');
  return ctx;
}
