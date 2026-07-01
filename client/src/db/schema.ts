import { getDb } from './client';

// Runs once on app startup. CREATE TABLE IF NOT EXISTS is safe to run
// every launch — it's a no-op once the tables already exist.
export async function runMigrations() {
  const db = await getDb();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1), -- enforces a single row
      height_cm REAL NOT NULL,
      weight_kg REAL NOT NULL,
      age INTEGER NOT NULL,
      sex TEXT NOT NULL CHECK (sex IN ('male', 'female')),
      step_goal INTEGER NOT NULL DEFAULT 0,
      calorie_goal INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS weight_entries (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,        -- ISO date, e.g. '2026-06-28'
      weight_kg REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_weight_entries_date ON weight_entries(date);


    CREATE TABLE IF NOT EXISTS daily_activity (
  date TEXT PRIMARY KEY,        -- 'YYYY-MM-DD', local date
  steps INTEGER NOT NULL DEFAULT 0,
  calories INTEGER NOT NULL DEFAULT 0,
  step_goal INTEGER NOT NULL DEFAULT 0,    -- snapshot of goal that day (optional but useful for history accuracy)
  calorie_goal INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);


  `);
}