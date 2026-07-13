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

// --- Label cleaning ---------------------------------------------------------
// Purely cosmetic: turn messy typed/spoken input into a clean, human-looking
// reminder name. None of this touches the scheduled time / frequency / repeat.

// Common misspellings & shorthands for words that show up in reminders. Lets the
// parser feel smart without a real spell-checker. Keys are lowercase.
const TYPO_FIXES: Record<string, string> = {
  medicien: 'medicine', medecine: 'medicine', medicin: 'medicine', mediciene: 'medicine',
  medcine: 'medicine', medisine: 'medicine',
  medation: 'medication', medicaton: 'medication', medicatoin: 'medication',
  tablest: 'tablets', tablts: 'tablets',
  appointmnt: 'appointment', apointment: 'appointment', appointmentt: 'appointment', appt: 'appointment',
  meetign: 'meeting', metting: 'meeting', meething: 'meeting', meting: 'meeting', mtg: 'meeting',
  worout: 'workout', workut: 'workout', workot: 'workout',
  excercise: 'exercise', exercize: 'exercise', excersize: 'exercise',
  watter: 'water', watr: 'water',
  breakfst: 'breakfast', brekfast: 'breakfast', breakfsat: 'breakfast',
  dinnner: 'dinner', luch: 'lunch',
  doctr: 'doctor', docter: 'doctor',
  grocries: 'groceries', groceris: 'groceries',
  vitamn: 'vitamin', vitmin: 'vitamin',
  laundy: 'laundry', laundary: 'laundry',
  birthdy: 'birthday', bday: 'birthday',
  tomorow: 'tomorrow', tomorrw: 'tomorrow',
};

function fixTypos(text: string): string {
  return text.replace(/[A-Za-z']+/g, (word) => {
    const fix = TYPO_FIXES[word.toLowerCase()];
    if (!fix) return word;
    // Preserve the original word's leading capitalization.
    return /^[A-Z]/.test(word) ? fix.charAt(0).toUpperCase() + fix.slice(1) : fix;
  });
}

// Polite/filler lead-ins ("hey", "please", "can you", "i need to"…).
const LEAD_IN =
  /^(?:\s*(?:hey|hi|ok|okay|so|um|please|pls|plz|kindly|can you|could you|would you|will you|i (?:need|have|want|would like|gotta|wanna) to|i'?m supposed to|don'?t forget to|dont forget to|make sure (?:to|i)|help me)\b\s*)+/i;
// The reminder command wrapper itself.
const COMMAND =
  /^(?:give me (?:a )?reminder|set(?:ting)?(?: up)? (?:a |an )?reminder|create (?:a )?reminder|add (?:a )?reminder|remind me|reminder|alert me|notify me|ping me|wake me(?: up)?)\b[\s,:-]*/i;
// Connective words right after the command ("to", "about", "that", "the", "a"…).
const CONNECTOR = /^(?:to|for|about|that|the|a|an)\b\s*/i;
// Dangling connective words left over once the time phrase is removed.
const TRAILING =
  /[\s,]+(?:at|on|by|for|to|in|the|a|an|of|every|this|next|today|tonight|and|with|please|pls)$/i;

function cleanLabel(raw: string): string {
  let s = (raw ?? '').trim();
  if (!s) return '';

  // Remove leftover scheduling phrases ("3 times a day", "twice in a row").
  s = s
    .replace(/\b(\d+|once|twice|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*times?\s*a\s*day\b/gi, '')
    .replace(BURST_PATTERN, '')
    .trim();

  // Peel polite lead-ins + the command wrapper, then any connectors after it.
  s = s.replace(LEAD_IN, '').replace(COMMAND, '').replace(LEAD_IN, '').trim();
  let prevConn: string;
  do {
    prevConn = s;
    s = s.replace(CONNECTOR, '').trim();
  } while (s !== prevConn && s.length > 0);

  // Trim dangling connective words and stray punctuation.
  let prev: string;
  do {
    prev = s;
    s = s.replace(TRAILING, '').trim();
  } while (s !== prev && s.length > 0);
  s = s.replace(/\s{2,}/g, ' ').replace(/^[\s,;:.\-]+|[\s,;:.\-]+$/g, '').trim();

  // Light spelling fixes, then sentence-case the first letter (leave the rest).
  s = fixTypos(s);
  if (s) s = s.charAt(0).toUpperCase() + s.slice(1);

  return s;
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

    // Strip whatever chrono matched, PLUS the literal "everyday"/"every day".
    // chrono matched against normalizedText, so strip the matched span from THAT
    // by index — matched.text may not exist verbatim in the original (e.g. "p.m"
    // was normalized to "PM"), which would otherwise leave the time words stuck
    // in the label.
    const withoutTime =
      normalizedText.slice(0, matched.index) + normalizedText.slice(matched.index + matched.text.length);
    label = withoutTime.replace(EVERYDAY_PATTERN, '').trim();
  } else if (explicitEveryday) {
    // No time found at all, but "everyday" was said — still record the intent to repeat daily
    repeat = 'daily';
    label = safeText.replace(EVERYDAY_PATTERN, '').trim();
  }

  label = cleanLabel(label);
  if (!label) {
    // Nothing meaningful survived (e.g. "remind me at 5pm") — the text was all
    // command + time with no subject, so use a neutral name rather than echoing
    // the raw command back.
    label = 'Reminder';
  }

  const frequencyCount = extractFrequencyCount(safeText);
  const { fireCount, repeatBurstDaily } = extractRepeatBurst(safeText);

  const times: ParsedTimeDraft[] = frequencyCount
    ? // "N times a day": spread N slots 2h apart. If the text also named a start
      // time (e.g. "wake me up at 7am, 3 times a day"), start from it; otherwise
      // generateFrequencyTimes falls back to ~1 hour from now.
      generateFrequencyTimes(Math.min(frequencyCount, 24), time).map((t) => ({
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