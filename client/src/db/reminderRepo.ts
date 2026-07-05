import { randomUUID } from 'expo-crypto';
import { getDb } from './client';
import type { Reminder, ReminderTime, ParsedTimeDraft } from '@/domain/reminders/types';
import { scheduleTime, cancelTime } from '@/services/reminderScheduler';


function mapRowToTime(row:any):ReminderTime{
    return{
        id: row.id,
        reminderId: row.reminder_id,
        time: row.time,
        repeat: row.repeat,
        date: row.date,
        fireCount: row.fire_count,
        fireIntervalSeconds: row.fire_interval_seconds,
        repeatBurstDaily: row.repeat_burst_daily === 1,
        notificationIds: row.notification_ids ? JSON.parse(row.notification_ids) : [],

    }
}

export async function getAllReminders():Promise<Reminder[]>{
    const db = await getDb();
    const reminderRows = await db.getAllAsync<any>('SELECT * FROM reminders');
    const timeRows = await db.getAllAsync<any>('SELECT * FROM reminder_times');


    return reminderRows.map((r) => ({
        id: r.id,
        label: r.label,
        enabled: r.enabled === 1,
        times: timeRows.filter((t) => t.reminder_id === r.id).map(mapRowToTime),
    }));
}

export async function getReminderById(id:string) : Promise<Reminder | null>{
    const db = await getDb();
  const reminderRow = await db.getFirstAsync<any>(
    'SELECT * FROM reminders WHERE id = ?',
    [id]
  );
  if (!reminderRow) return null;

  const timeRows = await db.getAllAsync<any>(
    'SELECT * FROM reminder_times WHERE reminder_id = ?',
    [id]
  );

  return {
    id: reminderRow.id,
    label: reminderRow.label,
    enabled: reminderRow.enabled === 1,
    times: timeRows.map(mapRowToTime),
  };
}


export async function createReminder(
    label:string,
    times:ParsedTimeDraft[]
):Promise<string>{


    const db = await getDb();
    const reminderId = randomUUID();
    await db.runAsync(
    'INSERT INTO reminders (id, label, enabled) VALUES (?, ?, 1)',
    [reminderId, label]
    );


    for (const draft of times) {
    const notificationIds = await scheduleTime(label, draft);
    await db.runAsync(
        `INSERT INTO reminder_times
        (id, reminder_id, time, repeat, date, fire_count, fire_interval_seconds, repeat_burst_daily, notification_ids)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
        randomUUID(),
        reminderId,
        draft.time,
        draft.repeat,
        draft.date,
        draft.fireCount,
        draft.fireIntervalSeconds,
        draft.repeatBurstDaily ? 1 : 0,
        JSON.stringify(notificationIds),
        ]
    );
    }

    return reminderId;

}



export async function updateReminder(
    id: string,
    label: string,
    times: ParsedTimeDraft[]
  ): Promise<void> {
    const db = await getDb();
  
    const existingTimeRows = await db.getAllAsync<any>(
      'SELECT notification_ids FROM reminder_times WHERE reminder_id = ?',
      [id]
    );
    for (const row of existingTimeRows) {
      const ids: string[] = row.notification_ids ? JSON.parse(row.notification_ids) : [];
      await cancelTime(ids);
    }
  
    await db.runAsync('DELETE FROM reminder_times WHERE reminder_id = ?', [id]);
    await db.runAsync('UPDATE reminders SET label = ? WHERE id = ?', [label, id]);
  
    for (const draft of times) {
      const notificationIds = await scheduleTime(label, draft);
      await db.runAsync(
        `INSERT INTO reminder_times
          (id, reminder_id, time, repeat, date, fire_count, fire_interval_seconds, repeat_burst_daily, notification_ids)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          id,
          draft.time,
          draft.repeat,
          draft.date,
          draft.fireCount,
          draft.fireIntervalSeconds,
          draft.repeatBurstDaily ? 1 : 0,
          JSON.stringify(notificationIds),
        ]
      );
    }
}



export async function toggleReminder(id: string, enabled: boolean): Promise<void> {
    const db = await getDb();
    await db.runAsync('UPDATE reminders SET enabled = ? WHERE id = ?', [enabled ? 1 : 0, id]);
  
    const reminder = await getReminderById(id);
    if (!reminder) return;
  
    if (!enabled) {
      for (const t of reminder.times) {
        await cancelTime(t.notificationIds);
      }
    } else {
      for (const t of reminder.times) {
        await cancelTime(t.notificationIds); // cancel what's already stored, THEN reschedule

        const notificationIds = await scheduleTime(reminder.label, t);
        await db.runAsync(
          'UPDATE reminder_times SET notification_ids = ? WHERE id = ?',
          [JSON.stringify(notificationIds), t.id]
        );
      }
    }
  }
  
  export async function deleteReminder(id: string): Promise<void> {
    const db = await getDb();
    const reminder = await getReminderById(id);
    if (reminder) {
      for (const t of reminder.times) {
        await cancelTime(t.notificationIds);
      }
    }
    await db.runAsync('DELETE FROM reminders WHERE id = ?', [id]); // cascades to reminder_times
  }
  
  export async function rescheduleAllReminders(): Promise<void> {
    const reminders = await getAllReminders();
    for (const reminder of reminders) {
      if (!reminder.enabled) continue;
      for (const t of reminder.times) {
        await cancelTime(t.notificationIds); // cancel what's already stored, THEN reschedule

        const notificationIds = await scheduleTime(reminder.label, t);
        const db = await getDb();
        await db.runAsync(
          'UPDATE reminder_times SET notification_ids = ? WHERE id = ?',
          [JSON.stringify(notificationIds), t.id]
        );
      }
    }
  }






