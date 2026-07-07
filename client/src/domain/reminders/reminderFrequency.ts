export function generateFrequencyTimes(
    count: number,
    windowStart: string = '08:00',
    windowEnd: string = '23:10'
  ): string[] {
    if (count <= 1) return [windowStart];
  
    const [startH, startM] = windowStart.split(':').map(Number);
    const [endH, endM] = windowEnd.split(':').map(Number);
    const startMin = startH * 60 + startM;
    const endMin = endH * 60 + endM;
    const step = (endMin - startMin) / (count - 1);
  
    return Array.from({ length: count }, (_, i) => {
      const totalMin = Math.round(startMin + step * i);
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    });
  }
  
  export function extractFrequencyCount(text: string): number | null {
    const wordMap: Record<string, number> = { once: 1, twice: 2 };
    const match = text.match(/(\d+|once|twice)\s*times?\s*a\s*day/i);
    if (!match) return null;
  
    const raw = match[1].toLowerCase();
    return wordMap[raw] ?? parseInt(raw, 10);
  }