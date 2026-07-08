import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { ParsedTimeDraft, ReminderTime } from '@/domain/reminders/types';

const CHANNEL_ID = 'reminders';

/** Map a persisted time row to a scheduler draft; null if time is missing. */
export function toScheduleDraft(row: ParsedTimeDraft | ReminderTime): ParsedTimeDraft | null {
  if (!row.time) return null;
  return {
    time: row.time,
    repeat: row.repeat,
    date: row.date,
    fireCount: row.fireCount,
    fireIntervalSeconds: row.fireIntervalSeconds,
    repeatBurstDaily: row.repeatBurstDaily,
    meridiemAmbiguous: false,
  };
}

export async function ensureReminderChannel() {
    if (Notifications.setNotificationChannelAsync) {
      await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Reminders',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }
}


/** Ensure burst settings are consistent before scheduling. */
function normalizeScheduleRow(row: ParsedTimeDraft): ParsedTimeDraft {
  const fireCount = Math.max(1, Math.min(5, row.fireCount ?? 1));
  const intervalSeconds = Math.max(1, row.fireIntervalSeconds ?? 60);

  if (row.repeat === 'daily' && fireCount > 1) {
    return {
      ...row,
      fireCount,
      fireIntervalSeconds: intervalSeconds,
      // Default ON: all pops repeat daily unless user explicitly turned it off.
      repeatBurstDaily: row.repeatBurstDaily !== false,
    };
  }

  return { ...row, fireCount, fireIntervalSeconds: intervalSeconds };
}

function nextTriggerDate(time: string, date: string | null): Date {
  const [hours, minutes] = time.split(':').map(Number);

  // IMPORTANT: Avoid `new Date('YYYY-MM-DD')` which is parsed as UTC midnight
  // and can shift the day/time in local timezones.
  if (date) {
    const [y, m, d] = date.split('-').map(Number);
    return new Date(y, m - 1, d, hours, minutes, 0, 0);
  }

  const trigger = new Date();
  trigger.setHours(hours, minutes, 0, 0);

  // If it's a daily reminder and today's time already passed, push to tomorrow.
  if (trigger.getTime() <= Date.now()) {
    trigger.setDate(trigger.getDate() + 1);
  }

  return trigger;
}

function buildRepeatingTrigger(hour: number, minute: number): Notifications.NotificationTriggerInput {
  // CALENDAR is iOS-only; DAILY works on both Android and iOS.
  if (Platform.OS === 'ios') {
    return {
      type: Notifications.SchedulableTriggerInputTypes.CALENDAR,
      hour,
      minute,
      repeats: true,
      channelId: CHANNEL_ID,
    };
  }

  return {
    type: Notifications.SchedulableTriggerInputTypes.DAILY,
    hour,
    minute,
    channelId: CHANNEL_ID,
  };
}


export async function scheduleTime(
    label: string,
    row: ParsedTimeDraft
  ): Promise<string[]> {
    if (!row.time) return [];

    const normalized = normalizeScheduleRow(row);
    const ids: string[] = [];
    const baseTrigger = nextTriggerDate(normalized.time!, normalized.date);
    const isDaily = normalized.repeat === 'daily';
    const burstRepeatsDaily = isDaily && normalized.repeatBurstDaily;
    const fireCount = normalized.fireCount;
    const intervalSeconds = normalized.fireIntervalSeconds;
  
    for (let i = 0; i < fireCount; i++) {
      const fireDate = new Date(baseTrigger.getTime() + i * intervalSeconds * 1000);
      const thisFireRepeatsDaily = i === 0 ? isDaily : burstRepeatsDaily;

      // Safety net: if a one-off fireDate is in the past, bump it forward by a day
      // to avoid silently scheduling "in the past" (which won't fire).
      if (!thisFireRepeatsDaily && fireDate.getTime() <= Date.now()) {
        fireDate.setDate(fireDate.getDate() + 1);
      }
  
      const id = await Notifications.scheduleNotificationAsync({
        content: { title: 'HealthApp', body: label },
        trigger: thisFireRepeatsDaily
          ? buildRepeatingTrigger(fireDate.getHours(), fireDate.getMinutes())
          : {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: fireDate,
              channelId: CHANNEL_ID,
            },
      });
      ids.push(id);
    }
  
    return ids;
  }



export async function cancelTime(notificationIds: string[]): Promise<void> {
    for (const id of notificationIds) {
      await Notifications.cancelScheduledNotificationAsync(id);
    }
  }
  
  export async function snoozeNotification(label: string, delayMinutes: number): Promise<void> {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'HealthApp', body: label },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: delayMinutes * 60,
        repeats: false,
        channelId: CHANNEL_ID,
      },
    });
  }