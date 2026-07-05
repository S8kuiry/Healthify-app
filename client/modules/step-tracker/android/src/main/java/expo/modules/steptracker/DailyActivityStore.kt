package expo.modules.steptracker

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.util.Log

object DailyActivityStore {
  private const val TAG = "DailyActivityStore"
  private const val DB_NAME = "healthapp.db"
  private const val TABLE = "daily_activity"

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
    val db = context.openOrCreateDatabase(DB_NAME, Context.MODE_PRIVATE, null)
    try {
      if (!tableExists(db)) {
        Log.w(TAG, "upsert skipped — $TABLE not found; JS migrations must run first")
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
    } catch (e: Exception) {
      Log.e(TAG, "upsert failed for date=$date steps=$steps", e)
    } finally {
      db.close()
    }
  }
}
