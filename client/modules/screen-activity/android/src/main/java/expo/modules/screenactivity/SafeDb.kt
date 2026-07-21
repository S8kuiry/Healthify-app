package expo.modules.screenactivity

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.util.Log
import java.io.File

/**
 * Opens the shared healthapp.db in a way that is SAFE to mix with expo-sqlite.
 *
 * The JS side does NOT use Android's framework SQLite - expo-sqlite bundles its
 * own engine (libsql). The database file is created and WAL-journalled by libsql,
 * so a framework connection must not try to take over WAL management.
 * `enableWriteAheadLogging()` does exactly that (it is not the same as
 * `PRAGMA journal_mode=WAL`): the framework connection pool sets up and owns the
 * -wal/-shm files with its own layout and locking. Layered on a libsql-owned WAL
 * that produced "database disk image is malformed" seconds after the database was
 * created, which broke onboarding, sleep settings, and the sleep card/graph.
 *
 * WAL is fully preserved. JS sets `PRAGMA journal_mode = WAL` in runMigrations()
 * and that is a persistent property of the file, so every later connection -
 * including these native ones - reads and writes through the WAL automatically.
 * The only change is that native code stops re-establishing WAL itself, which is
 * also what makes it see the JS side's committed frames (the original reason
 * enableWriteAheadLogging() was added here).
 */
object SafeDb {
  private const val TAG = "SafeDb"
  private const val DB_NAME = "healthapp.db"
  private const val BUSY_TIMEOUT_MS = 3000

  /**
   * Returns an open connection, or null when the database file does not exist
   * yet (JS migrations create it; native must never create it, or it would be
   * created by the wrong engine).
   */
  fun open(context: Context): SQLiteDatabase? {
    return try {
      val dbFile = File(File(context.filesDir, "SQLite"), DB_NAME)
      if (!dbFile.exists()) {
        Log.w(TAG, "healthapp.db not found; JS migrations must create it first")
        return null
      }
      openAt(dbFile)
    } catch (e: Exception) {
      Log.w(TAG, "Could not open healthapp.db", e)
      null
    }
  }

  /** Opens a known-existing db file. Throws on failure so callers can log context. */
  fun openAt(dbFile: File): SQLiteDatabase {
    val db = SQLiteDatabase.openDatabase(
      dbFile.absolutePath,
      null,
      // NO_LOCALIZED_COLLATORS stops the framework writing android_metadata on
      // open - an unexpected write into a libsql-owned file.
      SQLiteDatabase.OPEN_READWRITE or SQLiteDatabase.NO_LOCALIZED_COLLATORS
    )
    // Cooperate with the existing WAL: wait out a concurrent writer rather than
    // failing immediately. WAL exists precisely to allow this overlap.
    db.rawQuery("PRAGMA busy_timeout = $BUSY_TIMEOUT_MS;", null).use { it.moveToFirst() }
    return db
  }
}
