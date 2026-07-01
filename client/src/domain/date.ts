/** Local calendar date as YYYY-MM-DD (avoids UTC shift from toISOString). */
export function toLocalDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Monday = 0 … Sunday = 6 for a YYYY-MM-DD string. */
export function weekdayIndexMondayFirst(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

export function getCurrentWeekRange(): { start: string; end: string } {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  monday.setHours(0, 0, 0, 0);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: toLocalDateString(monday), end: toLocalDateString(sunday) };
}

export function getWeekDayStrings(startDate: string): string[] {
  const [y, m, d] = startDate.split('-').map(Number);
  const cursor = new Date(y, m - 1, d);
  const days: string[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(toLocalDateString(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}
