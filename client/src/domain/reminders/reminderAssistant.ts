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

function describeSchedule(t: ParsedTimeDraft): string {
  const timeLabel = t.time ? formatTime12h(t.time) : '—';
  const repeatLabel = t.repeat === 'daily' ? 'every day' : 'once';
  const popLabel = t.fireCount > 1 ? `${t.fireCount} times` : 'once';

  if (t.fireCount > 1) {
    const burstNote =
      t.repeat === 'daily'
        ? t.repeatBurstDaily
          ? ' (repeats every day)'
          : ' (burst today only)'
        : '';
    return `${popLabel} starting at ${timeLabel}, ${repeatLabel}${burstNote}`;
  }

  return `at ${timeLabel}, ${repeatLabel}`;
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
        message: `Did you mean ${options.amLabel} or ${options.pmLabel}?`,
        preview: `I'll remind you about "${trimmed}" — just need to confirm the time.`,
        ready: false,
        clarification: options,
      };
    }
  }

  if (!allTimesSet) {
    const popHint =
      first && first.fireCount > 1
        ? ` I noticed you want ${first.fireCount} reminders — I just need a start time.`
        : ' I still need a time — tap the clock below or pick a quick option.';
    return {
      message: `Got it.${popHint}`,
      preview: `I'll remind you about "${trimmed}".`,
      ready: false,
      clarification: null,
    };
  }

  const schedule = times.map(describeSchedule).join(' · ');
  return {
    message: `Ready to save — ${schedule}.`,
    preview: `I'll remind you about "${trimmed}" — ${schedule}.`,
    ready: true,
    clarification: null,
  };
}

export const QUICK_TIME_PHRASES = [
  { label: 'In 10 mins', phrase: 'in 10 mins' },
  { label: 'At 7 PM', phrase: 'at 7pm' },
  { label: 'Tomorrow 8 AM', phrase: 'tomorrow at 8am' },
] as const;