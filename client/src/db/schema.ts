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


    -- Global alarm tone + vibration. Single row (id = 1). sound_uri is a system
    -- ringtone URI string; NULL means "use the device default alarm sound".
    -- vibrate is 1 (on, default) or 0 (off).
    -- NOTE: This table is also read directly by the Kotlin AlarmService when an
    -- alarm fires (see AlarmService.kt). Keep the shape in sync.
    -- (The vibrate column is added just below for installs that predate it,
    -- BEFORE the seed INSERT references it.)
    CREATE TABLE IF NOT EXISTS reminder_sound (
      id INTEGER PRIMARY KEY CHECK (id = 1), -- enforces a single row
      sound_uri TEXT,
      vibrate INTEGER NOT NULL DEFAULT 1 CHECK (vibrate IN (0, 1))
    );

    -- Global alarm volume, 0–100. Single row (id = 1). Defaults to full (100).
    -- Also read directly by the Kotlin AlarmService at alarm time.
    CREATE TABLE IF NOT EXISTS reminder_volume (
      id INTEGER PRIMARY KEY CHECK (id = 1), -- enforces a single row
      volume INTEGER NOT NULL DEFAULT 100 CHECK (volume BETWEEN 0 AND 100)
    );

    -- Seed the single volume row so a plain SELECT always finds it.
    INSERT OR IGNORE INTO reminder_volume (id, volume) VALUES (1, 100);





-- ============================================================
-- SLEEP TRACKER — add this alongside screen_sessions and
-- daily_screen_summary in the same runMigrations() template literal.
-- ============================================================



    CREATE TABLE IF NOT EXISTS sleep_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),  -- enforces a single row
      window_start TEXT NOT NULL DEFAULT '23:00',  -- 'HH:mm', 24-hour
      window_end TEXT NOT NULL DEFAULT '07:00'     -- 'HH:mm', 24-hour
    );  
 
    -- Seed the single row so a plain SELECT always finds it, matching the
    -- reminder_volume table's seeding pattern.
    INSERT OR IGNORE INTO sleep_settings (id, window_start, window_end)
    VALUES (1, '23:00', '07:00');


  CREATE TABLE IF NOT EXISTS screen_sessions (
    id TEXT PRIMARY KEY,
    date TEXT NOT NULL,              -- 'YYYY-MM-DD', local date of start_time
    start_time TEXT NOT NULL,        -- ISO timestamp
    end_time TEXT,                   -- ISO timestamp; NULL while session is ongoing
    duration_minutes INTEGER         -- NULL until end_time is set
  );

  CREATE INDEX IF NOT EXISTS idx_screen_sessions_date ON screen_sessions(date);


  CREATE TABLE IF NOT EXISTS daily_screen_summary (
    date TEXT PRIMARY KEY,           -- 'YYYY-MM-DD'
    total_minutes INTEGER NOT NULL DEFAULT 0,
    session_count INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );




  `);

  // Backfill for installs whose reminder_sound table predates the `vibrate`
  // column: CREATE TABLE IF NOT EXISTS above is a no-op on the old table, so
  // ALTER it here. This MUST run before the seed INSERT below, which references
  // the column. Idempotent — ignore the "duplicate column" error on relaunch.
  try {
    await db.execAsync(
      `ALTER TABLE reminder_sound ADD COLUMN vibrate INTEGER NOT NULL DEFAULT 1 CHECK (vibrate IN (0, 1));`
    );
  } catch {
    // Column already exists — nothing to do.
  }

  // Seed the single sound row now that the column is guaranteed to exist.
  await db.execAsync(
    `INSERT OR IGNORE INTO reminder_sound (id, sound_uri, vibrate) VALUES (1, NULL, 1);`
  );

  // One-time normalization of the sleep window default.
  //
  // The seed INSERT above uses INSERT OR IGNORE, so installs created BEFORE the
  // '23:00'/'07:00' default was in place keep whatever their old seed wrote
  // (e.g. an AM start). This corrects that stored row to the intended default
  // exactly ONCE, gated by an app_meta flag so it can never fight a window the
  // user later sets themselves. After this has run once, updates from the
  // picker are the only thing that ever touches sleep_settings again.
  const flag = await db.getFirstAsync<{ value: string }>(
    `SELECT value FROM app_meta WHERE key = 'sleep_window_default_normalized';`
  );
  if (!flag) {
    await db.runAsync(
      `UPDATE sleep_settings SET window_start = '23:00', window_end = '07:00' WHERE id = 1;`
    );
    await db.runAsync(
      `INSERT OR REPLACE INTO app_meta (key, value) VALUES ('sleep_window_default_normalized', '1');`
    );
  }
}