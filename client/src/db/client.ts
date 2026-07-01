import * as SQLite from 'expo-sqlite';

// Single shared connection, opened once and reused everywhere.
// expo-sqlite's openDatabaseAsync returns a connection backed by the
// new SQLite NDK bindings (faster, async API) — this is the current
// recommended approach as of SDK 51+.
let dbInstance: SQLite.SQLiteDatabase | null = null;

export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;
  dbInstance = await SQLite.openDatabaseAsync('healthapp.db');
  return dbInstance;
}