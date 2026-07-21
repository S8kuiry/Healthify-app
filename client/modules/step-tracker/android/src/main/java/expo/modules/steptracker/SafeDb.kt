package expo.modules.steptracker

import android.database.sqlite.SQLiteDatabase
import android.util.Log
import java.io.File

/**
 * Opens the shared healthapp.db in a way that is SAFE to mix with expo-sqlite.
 *
 * Why this exists
 * ---------------
 * The JS side (expo-sqlite) does NOT use Android's framework SQLite - it bundles
 * its own engine (libsql - see the prebuilt libs under
 * node_modules/expo-sqlite/android/libsql/). The
 * database file is therefore created and journalled by libsql, while native
 * modules open the very same file with android.database.sqlite.
 *
 * Two independent SQLite implementations on one file is fine for plain reads and
 * writes - they both speak the on-disk format - but NOT if the framework side
 * also tries to take over WAL management. `enableWriteAheadLogging()` is not
 * "PRAGMA journal_mode=WAL"; it makes the framework connection pool set up and
 * own the -wal/-shm files with its own layout and locking. Doing that on top of
 * a libsql-owned WAL is what produced:
 *
 *     Error code : database disk image is malformed  (ERR_INTERNAL_SQLITE_ERROR)
 *
 * ...seconds after a fresh database was created, which broke onboarding, sleep
 * settings, and the sleep card/graph.
 *
 * The fix keeps WAL fully intact. The file stays in WAL mode - JS sets that with
 * `PRAGMA journal_mode = WAL` in runMigrations() and it is a persistent property
 * of the database file, so every later connection (native included) reads and
 * writes through the WAL automatically. Native connections simply stop trying to
 * re-establish WAL themselves:
 *
 *   - no enableWriteAheadLogging()  -> framework doesn't seize WAL ownership
 *   - NO_LOCALIZED_COLLATORS        -> don't rewrite android_metadata on open,
 *                                      which is a write libsql never expects
 *   - busy timeout                  -> wait out a concurrent writer instead of
 *                                      failing, since WAL allows exactly this
 */
object SafeDb {
  private const val TAG = "SafeDb"
  private const val DB_NAME = "healthapp.db"
  private const val BUSY_TIMEOUT_MS = 3000

  /**
   * Returns an open connection, or null when the database file does not exist
   * yet (JS migrations create it on first launch - native must never create it,
   * or it would be created by the wrong engine with the wrong journal setup).
   */
  fun open(context: android.content.Context): SQLiteDatabase? {
    return try {
      val dbFile = File(File(context.filesDir, "SQLite"), DB_NAME)
      if (!dbFile.exists()) {
        Log.w(TAG, "healthapp.db not found; JS migrations must create it first")
        return null
      }

      val db = SQLiteDatabase.openDatabase(
        dbFile.absolutePath,
        null,
        // NO_LOCALIZED_COLLATORS stops the framework from writing to
        // android_metadata on open - an unexpected write into a libsql-owned
        // file. OPEN_READWRITE because native modules do need to write rows.
        SQLiteDatabase.OPEN_READWRITE or SQLiteDatabase.NO_LOCALIZED_COLLATORS
      )

      // Cooperate with the WAL that is already in place rather than replacing
      // it: a reader/writer that arrives mid-write should wait, not error.
      db.rawQuery("PRAGMA busy_timeout = $BUSY_TIMEOUT_MS;", null).use { it.moveToFirst() }
      db
    } catch (e: Exception) {
      Log.w(TAG, "Could not open healthapp.db", e)
      null
    }
  }
}
