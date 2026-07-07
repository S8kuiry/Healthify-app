import * as chrono from 'chrono-node';
import { generateFrequencyTimes, extractFrequencyCount } from './reminderFrequency';
import type { ParsedReminderDraft, ParsedTimeDraft } from './types';

const directPhrases = /remind me|reminder|alert me|notify me/i;
const eventOnlyPhrases = /meeting|call|appointment|interview|class/i;

const ENGLISH_NUMBERS: Record<string, number> = {
  once: 1, twice: 2, one: 1, two: 2, three: 3, 'three times': 3,
  four: 4, 'four times': 4, five: 5, 'five times': 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

// Single source of truth for the burst pattern — used by both
// extractRepeatBurst AND the label sanitizer, so they can't drift apart.
const BURST_PATTERN = /\b(\d+|once|twice|three|four|five|six|seven|eight|nine|ten)\b\s*times?(\s*in a row)?/i;

/**
 * Extracts the burst loop (nag count).
 * Requires the literal word "times" adjacent to the number, so phrases
 * like "take 3 pills" or "walk 5 miles" never match — there's no "times" there.
 */
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

  // Cap bursts at 5 to avoid hammering the OS notification scheduler.
  fireCount = Math.min(Math.max(fireCount, 1), 5);

  return { fireCount, repeatBurstDaily: !isInARow };
}

function classifyNeedsClarification(text: string): boolean {
  if (directPhrases.test(text)) return false;
  if (eventOnlyPhrases.test(text)) return true;
  return false;
}

export function parseReminderInput(text: string): ParsedReminderDraft {
  const chronoResults = chrono.parse(text);
  const matched = chronoResults[0];

  let label = text.trim();
  let time: string | null = null;
  let date: string | null = null;
  let repeat: 'daily' | 'once' = 'once';

  if (matched) {
    const parsedDate = matched.start.date();
    const hasExplicitDay = matched.start.isCertain('day');
    const isRelative = /\bin\s+(\d+|a|an|one|two|few)\s*(min|mins|minutes|hour|hours|hr|hrs|sec|seconds)?/i.test(
      matched.text
    );

    time = `${String(parsedDate.getHours()).padStart(2, '0')}:${String(parsedDate.getMinutes()).padStart(2, '0')}`;

    if (isRelative) {
      // "in 10 mins", "in 2 hours" — fire once at the computed time today
      repeat = 'once';
      date = parsedDate.toISOString().split('T')[0];
    } else {
      date = hasExplicitDay ? parsedDate.toISOString().split('T')[0] : null;
      repeat = hasExplicitDay ? 'once' : 'daily';
    }

    label = text.replace(matched.text, '').trim();
  }

  label = label
    .replace(/^(give me a reminder|remind me|set a reminder)\s*(to|for|about)?/i, '')
    .replace(/\b(\d+|once|twice|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*times?\s*a\s*day/i, '')
    .replace(BURST_PATTERN, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!label) {
    label = text.trim();
  }

  const frequencyCount = extractFrequencyCount(text);
  const { fireCount, repeatBurstDaily } = extractRepeatBurst(text);

  // No fallback guessing — if chrono found nothing, time stays null.
  // The editor is responsible for prompting the user to set one.
  const times: ParsedTimeDraft[] = frequencyCount
    ? generateFrequencyTimes(Math.min(frequencyCount, 24)).map((t) => ({
        time: t,
        repeat: 'daily',
        date: null,
        fireCount: 1,
        fireIntervalSeconds: 60,
        repeatBurstDaily: true,
      }))
    : [
        {
          time, // string | null, honestly reflecting what was detected
          repeat: time ? repeat : 'once',
          date,
          fireCount,
          fireIntervalSeconds: 60,
          repeatBurstDaily,
        },
      ];

  return {
    label,
    times,
    needsEventClarification: classifyNeedsClarification(text),
  };
}