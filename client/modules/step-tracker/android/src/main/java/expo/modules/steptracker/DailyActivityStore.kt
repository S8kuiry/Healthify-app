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
    // IMPORTANT: Must use the same DB file location as expo-sqlite.
    // expo-sqlite defaultDatabaseDirectory on Android is: context.filesDir + "/SQLite"
    val dbDir = File(context.filesDir, "SQLite")
    if (!dbDir.exists()) dbDir.mkdirs()
    val dbFile = File(dbDir, DB_NAME)
    var db: SQLiteDatabase? = null
    try {
      db = SQLiteDatabase.openOrCreateDatabase(dbFile, null)
      // Enable WAL mode to handle concurrent access from screen activity service
      db.enableWriteAheadLogging()

      if (!loggedDbPathOnce) {
        loggedDbPathOnce = true
        Log.w(TAG, "using sqlite path=${db.path} (expected expo-sqlite dir=${dbDir.absolutePath})")
      }
      if (!tableExists(db)) {
        Log.w(TAG, "upsert skipped — $TABLE not found (db.path=${db.path}); JS migrations must run first")
        return
      }

      val values = ContentValues().apply {
        put("steps", steps)
        put("calories", calories)
        put("step_goal", stepGoal)
        put("calorie_goal", calorieGoal)
      }

      val updated = db.update(TABLE, values, "date = ?", arrayOf(date))
      if (updated == 0) {
        values.put("date", date)
        db.insertWithOnConflict(TABLE, null, values, SQLiteDatabase.CONFLICT_ABORT)
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
