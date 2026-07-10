import type { ParsedTimeDraft } from './types';

export type MeridiemClarification = {
  kind: 'ambiguous_meridiem';
  amTime: string;
  pmTime: string;
  amLabel: string;
  pmLabel: string;
};

export type AssistantState = {
  message: string;
  preview: string | null;
  ready: boolean;
  clarification: MeridiemClarification | null;
};

function meridiemOptions(time24: string): MeridiemClarification | null {
  const parts = time24.split(':');
  if (parts.length !== 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;

  const minute = String(m).padStart(2, '0');
  const faceHour = h % 12 || 12;
  const amHour24 = faceHour === 12 ? 0 : faceHour;
  const pmHour24 = faceHour === 12 ? 12 : faceHour + 12;
  const amTime = `${String(amHour24).padStart(2, '0')}:${minute}`;
  const pmTime = `${String(pmHour24).padStart(2, '0')}:${minute}`;

  return {
    kind: 'ambiguous_meridiem',
    amTime,
    pmTime,
    amLabel: `${faceHour === 12 ? 12 : faceHour}:${minute} AM`,
    pmLabel: `${faceHour}:${minute} PM`,
  };
}

function formatTime12h(time: string): string {
  const parts = time.split(':');
  if (parts.length !== 2) return time;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return time;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

function isToday(dateStr: string): boolean {
  const today = new Date();
  const y = today.getFullYear();
  const m = String(today.getMonth() + 1).padStart(2, '0');
  const d = String(today.getDate()).padStart(2, '0');
  return dateStr === `${y}-${m}-${d}`;
}

// 'YYYY-MM-DD' -> 'Jul 12'
function formatDateNice(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return dateStr;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function describeSchedule(t: ParsedTimeDraft): string {
  const timeLabel = t.time ? formatTime12h(t.time) : '—';
  // Only surface a date for one-off reminders on a day other than today.
  const showDate = t.repeat === 'once' && !!t.date && !isToday(t.date);
  const cadence = t.repeat === 'daily' ? 'every day' : showDate ? `on ${formatDateNice(t.date!)}` : null;

  if (t.fireCount > 1) {
    const todayOnly = t.repeat === 'daily' && !t.repeatBurstDaily ? ' (today only)' : '';
    const tail = cadence ? `, ${cadence}` : '';
    return `${t.fireCount} times from ${timeLabel}${tail}${todayOnly}`;
  }

  if (t.repeat === 'daily') return `every day at ${timeLabel}`;
  return showDate ? `on ${formatDateNice(t.date!)} at ${timeLabel}` : `at ${timeLabel}`;
}

export function getAssistantState(label: string, times: ParsedTimeDraft[]): AssistantState {
  const trimmed = label.trim();
  const first = times[0];
  const allTimesSet = times.every((t) => t.time !== null);

  if (!trimmed) {
    return { message: 'What should I remind you about?', preview: null, ready: false, clarification: null };
  }

  // Ambiguous AM/PM takes priority over "missing time" — a wrong guess is
  // worse than a visible blank, so we surface it before saying "Ready."
  if (first?.time && first.meridiemAmbiguous) {
    const options = meridiemOptions(first.time);
    if (options) {
      return {
        message: `Quick check — did you mean ${options.amLabel} or ${options.pmLabel}?`,
        preview: `Almost there — I'll remind you about "${trimmed}", just confirm the time.`,
        ready: false,
        clarification: options,
      };
    }
  }

  if (!allTimesSet) {
    const popHint =
      first && first.fireCount > 1
        ? ` I'll send ${first.fireCount} nudges — just pick a start time below.`
        : ' Just pick a time below, or tap a quick option.';
    return {
      message: `Got it.${popHint}`,
      preview: `I'll remind you about "${trimmed}".`,
      ready: false,
      clarification: null,
    };
  }

  const schedule = times.map(describeSchedule).join(' · ');
  return {
    message: `All set — I'll remind you ${schedule}.`,
    preview: `You're good to go — I'll remind you about "${trimmed}" ${schedule}.`,
    ready: true,
    clarification: null,
  };
}

export const QUICK_TIME_PHRASES = [
  { label: 'In 10 mins', phrase: 'in 10 mins' },
  { label: 'At 7 PM', phrase: 'at 7pm' },
  { label: 'Tomorrow 8 AM', phrase: 'tomorrow at 8am' },
] as const;