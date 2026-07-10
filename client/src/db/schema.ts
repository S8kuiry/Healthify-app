import { getDb } from './client';

// Runs once on app startup. CREATE TABLE IF NOT EXISTS is safe to run
// every launch — it's a no-op once the tables already exist.
export async function runMigrations() {
  const db = await getDb();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;


    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY CHECK (id = 1), -- enforces a single row
      height_cm REAL NOT NULL,
      weight_kg REAL NOT NULL,
      age INTEGER NOT NULL,
      sex TEXT NOT NULL CHECK (sex IN ('male', 'female')),
      step_goal INTEGER NOT NULL DEFAULT 0,
      calorie_goal INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT
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





    CREATE TABLE IF NOT EXISTS reminders (
    id TEXT PRIMARY KEY,
    label TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1
    );


    CREATE TABLE IF NOT EXISTS reminder_times (
    id TEXT PRIMARY KEY,
    reminder_id TEXT NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
    time TEXT NOT NULL,
    repeat TEXT NOT NULL CHECK (repeat IN ('daily', 'once')),
    date TEXT,
    fire_count INTEGER NOT NULL DEFAULT 1,
    fire_interval_seconds INTEGER NOT NULL DEFAULT 60,
    repeat_burst_daily INTEGER NOT NULL DEFAULT 1,
    notification_ids TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_reminder_times_reminder_id
    ON reminder_times(reminder_id);





  `);
}