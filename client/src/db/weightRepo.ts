import { getDb } from './client';

export type WeightEntry = {
  id: string;
  date: string;
  weightKg: number;
};

export async function getAllWeightEntries(): Promise<WeightEntry[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{ id: string; date: string; weight_kg: number }>(
    'SELECT id, date, weight_kg FROM weight_entries ORDER BY date ASC;'
  );
  return rows.map((r) => ({ id: r.id, date: r.date, weightKg: r.weight_kg }));
}

export async function upsertWeightEntry(date: string, weightKg: number): Promise<WeightEntry> {
  const db = await getDb();

  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM weight_entries WHERE date = ?;',
    [date]
  );

  const id = existing?.id ?? `${date}-${Date.now()}`;

  await db.runAsync(
    `INSERT INTO weight_entries (id, date, weight_kg)
     VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET weight_kg = excluded.weight_kg;`,
    [id, date, weightKg]
  );

  return { id, date, weightKg };
}

export async function upsertWeightEntryForToday(weightKg: number): Promise<WeightEntry> {
  const today = new Date().toISOString().split('T')[0];
  return upsertWeightEntry(today, weightKg);
}

export async function deleteWeightEntry(id: string): Promise<void> {
  const db = await getDb();
  await db.runAsync('DELETE FROM weight_entries WHERE id = ?;', [id]);
}

/**
 * Year-rollover reset: delete weight entries from before `year`, keeping only the
 * single most recent one — the "anchor" that seeds the new year's weight trend.
 */
export async function pruneWeightsBeforeYear(year: string): Promise<void> {
  const db = await getDb();
  const cutoff = `${year}-01-01`;
  const anchor = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM weight_entries WHERE date < ? ORDER BY date DESC LIMIT 1;',
    [cutoff]
  );
  if (anchor) {
    await db.runAsync('DELETE FROM weight_entries WHERE date < ? AND id != ?;', [cutoff, anchor.id]);
  }
}