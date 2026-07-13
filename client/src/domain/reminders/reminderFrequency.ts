// Even time-spreading for "N times a day" reminders.
//
// Design: a reminder's "times per day" count generates N time slots spaced a
// fixed gap apart (default 2h) from a start time — NOT squeezed into a fixed
// waking window. There is intentionally no 8:00–23:30 restriction; the user can
// edit any individual slot afterwards. Slots wrap around the 24h clock.

export const DEFAULT_GAP_MINUTES = 120; // 2 hours between slots

/** Round a Date up to the next 15-minute boundary and format as "HH:MM". */
function nextQuarterHour(from: Date = new Date()): string {
  const d = new Date(from);
  d.setSeconds(0, 0);
  const rem = d.getMinutes() % 15;
  if (rem !== 0) d.setMinutes(d.getMinutes() + (15 - rem));
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * Generate `count` times spaced `gapMinutes` apart starting from `startTime`.
 * - startTime "HH:MM": the first slot. If omitted, defaults to 1 hour from now
 *   (rounded to the next quarter hour) — matching "remind me ... (no time)".
 * - Slots that cross midnight wrap (e.g. 23:00 + 2h → 01:00).
 */
export function generateFrequencyTimes(
  count: number,
  startTime?: string | null,
  gapMinutes: number = DEFAULT_GAP_MINUTES
): string[] {
  const n = Math.max(1, count);

  let startMin: number;
  if (startTime && /^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
    const [h, m] = startTime.split(':').map(Number);
    startMin = h * 60 + m;
  } else {
    // No explicit start: begin one hour from now (rounded to next quarter hour).
    const inOneHour = new Date(Date.now() + 60 * 60 * 1000);
    const [h, m] = nextQuarterHour(inOneHour).split(':').map(Number);
    startMin = h * 60 + m;
  }

  return Array.from({ length: n }, (_, i) => {
    const totalMin = (startMin + i * gapMinutes) % (24 * 60);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  });
}

export function extractFrequencyCount(text: string): number | null {
  const wordMap: Record<string, number> = {
    once: 1, twice: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  };
  const match = text.match(
    /(\d+|once|twice|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*times?\s*a\s*day/i
  );
  if (!match) return null;

  const raw = match[1].toLowerCase();
  return wordMap[raw] ?? parseInt(raw, 10);
}
