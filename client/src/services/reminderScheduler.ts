import * as Notifications from 'expo-notifications';
import type { ParsedTimeDraft, ReminderTime } from '@/domain/reminders/types';

const CHANNEL_ID = 'reminders';


export async function ensureReminderChannel() {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
        name: 'Reminders',
        importance: Notifications.AndroidImportance.HIGH,
    });
}


function nextTriggerDate(time: string, date: string | null): Date {
    const [hours, minutes] = time.split(':').map(Number);
    const trigger = date ? new Date(date) : new Date();
    trigger.setHours(hours, minutes, 0, 0);

    // If it's a daily reminder and today's time already passed, push to tomorrow

    if (!date && trigger.getTime() <= Date.now()) {
        trigger.setDate(trigger.getDate() + 1);
    }
    return trigger;
}


export async function scheduleTime(
    label: string,
    row: ParsedTimeDraft
  ): Promise<string[]> {
    const ids: string[] = [];
    const baseTrigger = nextTriggerDate(row.time, row.date);
    const isDaily = row.repeat === 'daily';
    const burstRepeatsDaily = isDaily && row.repeatBurstDaily;
  
    for (let i = 0; i < row.fireCount; i++) {
      const fireDate = new Date(baseTrigger.getTime() + i * row.fireIntervalSeconds * 1000);
      const thisFireRepeatsDaily = i === 0 ? isDaily : burstRepeatsDaily;
  
      const id = await Notifications.scheduleNotificationAsync({
        content: { title: 'HealthApp', body: label },
        trigger: thisFireRepeatsDaily
          ? { hour: fireDate.getHours(), minute: fireDate.getMinutes(), repeats: true, channelId: CHANNEL_ID }
          : { date: fireDate, channelId: CHANNEL_ID },
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
      trigger: { seconds: delayMinutes * 60, channelId: CHANNEL_ID },
    });
  }