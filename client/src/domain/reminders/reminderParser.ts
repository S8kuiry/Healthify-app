import * as chrono from 'chrono-node';
import { generateFrequencyTimes, extractFrequencyCount } from './reminderFrequency';
import type { ParsedReminderDraft, ParsedTimeDraft } from './types';

const directPhrases = /remind me|reminder|alert me|notify me/i;
const eventOnlyPhrases = /meeting|call|appointment|interview|class/i;
const EVERYDAY_PATTERN = /\b(every\s?day|everyday)\b/i;
const VALID_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const EMPTY_TIME: ParsedTimeDraft = {
  time: null,
  repeat: 'once',
  date: null,
  fireCount: 1,
  fireIntervalSeconds: 60,
  repeatBurstDaily: true,
  meridiemAmbiguous: false,
};

export function ensureParsedTimeDraft(raw: Partial<ParsedTimeDraft>): ParsedTimeDraft {
  return {
    time: raw.time && VALID_TIME.test(raw.time) ? raw.time : null,
    repeat: raw.repeat === 'daily' ? 'daily' : 'once',
    date: raw.date ?? null,
    fireCount: Math.min(Math.max(raw.fireCount ?? 1, 1), 5),
    fireIntervalSeconds: Math.max(1, raw.fireIntervalSeconds ?? 60),
    repeatBurstDaily: raw.repeatBurstDaily !== false,
    meridiemAmbiguous: raw.meridiemAmbiguous ?? false,
  };
}

const ENGLISH_NUMBERS: Record<string, number> = {
  once: 1, twice: 2, one: 1, two: 2, three: 3, 'three times': 3,
  four: 4, 'four times': 4, five: 5, 'five times': 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

const BURST_PATTERN = /\b(\d+|once|twice|three|four|five|six|seven|eight|nine|ten)\b\s*times?(\s*in a row)?/i;

function normalizeForChrono(text: string): string {
  return text
    .replace(/\b(a|p)\.?\s*m\.?\b/gi, (_, ap) => (ap.toLowerCase() === 'a' ? 'AM' : 'PM'))
    .replace(/\b(at\s+)?(\d{1,2})\s*(o'?clock)\b/gi, '$1$2:00')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function formatTimeFromDate(d: Date): string | null {
  const h = d.getHours();
  const m = d.getMinutes();
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  return VALID_TIME.test(time) ? time : null;
}

function extractRepeatBurst(text: string): { fireCount: number; repeatBurstDaily: boolean } {
  const match = text.match(BURST_PATTERN);
  let fireCount = 1;
  let isInARow = false;

  if (match) {
    if (/times?\s*a\s*day/i.test(text)) {
      return { fireCount: 1, repeatBurstDaily: true };
    }
    const raw = match[1].toLowerCase();
    fireCount = ENGLISH_NUMBERS[raw] ?? (parseInt(raw, 10) || 1);
    isInARow = /\bin a row\b/i.test(text) || !!match[2];
  } else {
    const standaloneMatch = text.match(/\b(once|twice)\b/i);
    if (standaloneMatch && !/times?\s*a\s*day/i.test(text)) {
      const raw = standaloneMatch[1].toLowerCase();
      fireCount = ENGLISH_NUMBERS[raw] || 1;
      isInARow = /\bin a row\b/i.test(text);
    }
  }

  fireCount = Math.min(Math.max(fireCount, 1), 5);
  return { fireCount, repeatBurstDaily: !isInARow };
}

function classifyNeedsClarification(text: string): boolean {
  if (directPhrases.test(text)) return false;
  if (eventOnlyPhrases.test(text)) return true;
  return false;
}

export function parseReminderInput(text: string): ParsedReminderDraft {
  const safeText = (text ?? '').trim();
  if (!safeText) {
    return { label: '', times: [{ ...EMPTY_TIME }], needsEventClarification: false };
  }

  const normalizedText = normalizeForChrono(safeText);
  let chronoResults: chrono.ParsedResult[] = [];
  try {
    chronoResults = chrono.parse(normalizedText);
  } catch {
    chronoResults = [];
  }
  const matched = chronoResults[0];

  let label = safeText;
  let time: string | null = null;
  let date: string | null = null;
  let repeat: 'daily' | 'once' = 'once';
  let meridiemAmbiguous = false;

  const explicitEveryday = EVERYDAY_PATTERN.test(safeText);

  if (matched) {
    const parsedDate = matched.start.date();
    const hasExplicitDay = matched.start.isCertain('day');
    const isRelative = /\bin\s+(\d+|a|an|one|two|few)\s*(min|mins|minutes|hour|hours|hr|hrs|sec|seconds)?/i.test(
      matched.text
    );

    time = formatTimeFromDate(parsedDate);
    meridiemAmbiguous = time !== null && !matched.start.isCertain('meridiem');

    if (explicitEveryday) {
      // Explicit "everyday" always wins — force daily, ignore whatever chrono guessed for the date
      repeat = 'daily';
      date = null;
    } else if (isRelative) {
      repeat = 'once';
      date = parsedDate.toISOString().split('T')[0];
    } else {
      date = hasExplicitDay ? parsedDate.toISOString().split('T')[0] : null;
      repeat = hasExplicitDay ? 'once' : 'daily';
    }

    // Strip whatever chrono matched, PLUS the literal "everyday"/"every day"
    // if it wasn't already inside chrono's matched span.
    label = safeText.replace(matched.text, '').replace(EVERYDAY_PATTERN, '').trim();
  } else if (explicitEveryday) {
    // No time found at all, but "everyday" was said — still record the intent to repeat daily
    repeat = 'daily';
    label = safeText.replace(EVERYDAY_PATTERN, '').trim();
  }

  label = label
    .replace(/^(give me a reminder|remind me|set a reminder)\s*(to|for|about)?/i, '')
    .replace(/\b(\d+|once|twice|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*times?\s*a\s*day/i, '')
    .replace(BURST_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!label) {
    label = safeText;
  }

  const frequencyCount = extractFrequencyCount(safeText);
  const { fireCount, repeatBurstDaily } = extractRepeatBurst(safeText);

  const times: ParsedTimeDraft[] = frequencyCount
    ? generateFrequencyTimes(Math.min(frequencyCount, 24)).map((t) => ({
        time: t,
        repeat: 'daily',
        date: null,
        fireCount: 1,
        fireIntervalSeconds: 60,
        repeatBurstDaily: true,
        meridiemAmbiguous: false,
      }))
    : [
        {
          time,
          repeat: time ? repeat : 'once',
          date,
          fireCount,
          fireIntervalSeconds: 60,
          repeatBurstDaily,
          meridiemAmbiguous: time ? meridiemAmbiguous : false,
        },
      ];

  return {
    label,
    times,
    needsEventClarification: classifyNeedsClarification(safeText),
  };
}