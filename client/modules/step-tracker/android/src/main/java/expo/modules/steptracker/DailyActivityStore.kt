package expo.modules.steptracker

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.util.Log
import java.io.File

object DailyActivityStore {
  private const val TAG = "DailyActivityStore"
  private const val DB_NAME = "healthapp.db"
  private const val TABLE = "daily_activity"
  private const val MAX_RETRIES = 3
  private const val RETRY_DELAY_MS = 100L
  private var loggedDbPathOnce = false

  /**
   * Tables are created by JS migrations on first app launch. Native code only
   * writes rows — never runs DDL or PRAGMA (avoids execSQL crash pitfalls).
   */
  private fun tableExists(db: SQLiteDatabase): Boolean {
    db.rawQuery(
      "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
      arrayOf(TABLE)
    ).use { cursor ->
      return cursor.moveToFirst()
    }
  }

  fun upsert(
    context: Context,
    date: String,
    steps: Int,
    calories: Int,
    stepGoal: Int,
    calorieGoal: Int
  ) {
    upsertWithRetry(context, date, steps, calories, stepGoal, calorieGoal, 1)
  }

  private fun upsertWithRetry(
    context: Context,
    date: String,
    steps: Int,
    calories: Int,
    stepGoal: Int,
    calorieGoal: Int,
    attempt: Int
  ) {
    // Open through SafeDb: the file is created and WAL-journalled by expo-sqlite's
    // bundled libsql engine, so a framework connection must NOT call
    // openOrCreateDatabase()/enableWriteAheadLogging() on it. Doing so made the
    // framework seize WAL ownership of a libsql-owned file and corrupted it
    // ("database disk image is malformed") seconds after creation. WAL itself is
    // unchanged - it stays on, set by JS, and this connection uses it.
    var db: SQLiteDatabase? = null
    try {
      // Immutable local so the null check smart-casts for the rest of the block;
      // `db` still holds it for the finally-close below.
      val conn = SafeDb.open(context) ?: return
      db = conn

      if (!loggedDbPathOnce) {
        loggedDbPathOnce = true
        Log.w(TAG, "using sqlite path=${conn.path}")
      }
      if (!tableExists(conn)) {
        Log.w(TAG, "upsert skipped — $TABLE not found (db.path=${conn.path}); JS migrations must run first")
        return
      }

      val values = ContentValues().apply {
        put("steps", steps)
        put("calories", calories)
        put("step_goal", stepGoal)
        put("calorie_goal", calorieGoal)
      }

      val updated = conn.update(TABLE, values, "date = ?", arrayOf(date))
      if (updated == 0) {
        values.put("date", date)
        conn.insertWithOnConflict(TABLE, null, values, SQLiteDatabase.CONFLICT_ABORT)
      }
      Log.d(TAG, "Successfully upserted activity for date=$date steps=$steps on attempt $attempt")
    } catch (e: Exception) {
      if (attempt < MAX_RETRIES && (e.message?.contains("database is locked") == true ||
          e is android.database.sqlite.SQLiteDatabaseLockedException)) {
        Log.w(TAG, "Database locked during upsert (attempt $attempt/$MAX_RETRIES), retrying...", e)
        Thread.sleep(RETRY_DELAY_MS)
        upsertWithRetry(context, date, steps, calories, stepGoal, calorieGoal, attempt + 1)
      } else {
        Log.e(TAG, "upsert failed for date=$date steps=$steps on attempt $attempt", e)
      }
    } finally {
      db?.close()
    }
  }
}
