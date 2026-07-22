import * as SQLite from 'expo-sqlite';

// Single shared connection, opened once and reused everywhere.
// expo-sqlite's openDatabaseAsync returns a connection backed by the
// new SQLite NDK bindings (faster, async API) — this is the current
// recommended approach as of SDK 51+.
let dbInstance: SQLite.SQLiteDatabase | null = null;

const DB_NAME = 'healthapp.db';

/**
 * True when an error is SQLite's "database disk image is malformed" (SQLITE_CORRUPT)
 * or the related "not a database". Once the on-disk file is corrupt, EVERY query
 * rejects forever - the app is permanently stuck showing "Failed to load..." and can
 * never save. No amount of retrying fixes a malformed file; it must be deleted.
 */
function isCorruptionError(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? '').toLowerCase();
  return (
    msg.includes('disk image is malformed') ||
    msg.includes('file is not a database') ||
    msg.includes('database corruption') ||
    msg.includes('sqlite_corrupt') ||
    msg.includes('sqlite_notadb')
  );
}

/**
 * Deletes the corrupt database file (and its -wal/-shm siblings) so the next open
 * starts from a clean slate. runMigrations() then recreates every table + seed row,
 * so the app self-heals. This DOES reset local data (sleep window, screen sessions,
 * profile, etc.) - an unavoidable trade-off, but far better than an app that is
 * bricked forever by one bad write. See the sleep-screen bug where a malformed DB
 * made saves fail with ERR_INTERNAL_SQLITE_ERROR and alarms never rescheduled.
 */
async function deleteCorruptDatabase(): Promise<void> {
  try {
    if (dbInstance) {
      try {
        await dbInstance.closeAsync();
      } catch {
        // Best effort - a corrupt handle may reject on close too.
      }
      dbInstance = null;
    }
    await SQLite.deleteDatabaseAsync(DB_NAME);
    console.warn('[db] Deleted corrupt database; a fresh one will be created.');
  } catch (err) {
    console.error('[db] Failed to delete corrupt database:', err);
  }
}

/**
 * Opens (once) and returns the shared connection. On a normal launch this just
 * opens the file. If a probe query reveals the file is corrupt, it deletes the
 * file and reopens a clean one so migrations can rebuild it - the app recovers on
 * its own instead of being stuck forever.
 */
export async function getDb(): Promise<SQLite.SQLiteDatabase> {
  if (dbInstance) return dbInstance;

  dbInstance = await SQLite.openDatabaseAsync(DB_NAME);

  // Probe the file with a trivial read. Opening a corrupt DB can succeed lazily;
  // the malformed-image error only surfaces on the first real access. Doing the
  // probe here means we catch corruption ONCE, centrally, before any caller runs.
  try {
    await dbInstance.getFirstAsync('PRAGMA user_version;');
  } catch (err) {
    if (isCorruptionError(err)) {
      console.warn('[db] Database is malformed on open; recovering by recreating it.');
      await deleteCorruptDatabase();
      dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
    } else {
      throw err;
    }
  }

  return dbInstance;
}

/**
 * Exposed so higher layers (e.g. runMigrations) can trigger the same recovery if a
 * malformed-image error slips through at query time. Returns a fresh, clean handle.
 */
export async function recoverCorruptDatabase(): Promise<SQLite.SQLiteDatabase> {
  await deleteCorruptDatabase();
  dbInstance = await SQLite.openDatabaseAsync(DB_NAME);
  return dbInstance;
}

/**
 * Returns the shared connection after refreshing its view of the WAL, so reads
 * see rows written by the NATIVE side.
 *
 * Why this is needed: the JS connection is opened once and cached for the life of
 * the process, and the native services (sleep finalize, step tracker) run in that
 * SAME process but write through a completely different SQLite implementation -
 * Android's framework SQLite, vs expo-sqlite's bundled libsql. Each engine keeps
 * its own read snapshot of the WAL, so frames appended by one are not automatically
 * visible to a long-lived connection of the other.
 *
 * That is exactly why an overnight sleep window could finalize correctly at 07:18
 * (duration written, notification posted) yet the card and graph still read empty
 * hours later: the app process never died, so the cached JS connection kept
 * serving its pre-write snapshot.
 *
 * A PASSIVE checkpoint folds the committed WAL frames into the main database and
 * ends this connection's stale read snapshot, so the next query sees them.
 * Crucially it does NOT close the connection: an earlier version of this closed
 * and reopened, which invalidated the handle other callers (e.g. the sleep-window
 * picker) were already using and made them fail with "Access to closed resource".
 * PASSIVE also never blocks on a concurrent writer - it simply does nothing if the
 * WAL is busy, which is the right trade for a UI read.
 */
export async function getDbFresh(): Promise<SQLite.SQLiteDatabase> {
  const db = await getDb();
  try {
    await db.execAsync('PRAGMA wal_checkpoint(PASSIVE);');
  } catch (err) {
    // Never fatal: a failed checkpoint just means this read may be stale, which
    // is far better than breaking the caller.
    console.warn('[db] wal_checkpoint failed; read may be stale:', err);
  }
  return db;
}

export { isCorruptionError };
