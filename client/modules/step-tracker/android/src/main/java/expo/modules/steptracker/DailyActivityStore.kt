package expo.modules.steptracker

import android.content.Context

object DailyActivityStore {
  private const val DB_NAME = "healthapp.db"

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
    // Don't use execSQL for PRAGMA journal_mode — it returns a row and crashes.
    db.execSQL(
      """
      INSERT INTO daily_activity (date, steps, calories, step_goal, calorie_goal)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        steps = excluded.steps,
        calories = excluded.calories,
        step_goal = excluded.step_goal,
        calorie_goal = excluded.calorie_goal;
      """.trimIndent(),
      arrayOf(date, steps, calories, stepGoal, calorieGoal)
    )
  } catch (e: Exception) {
    android.util.Log.e("DailyActivityStore", "upsert failed", e)
  } finally {
    db.close()
  }
}
}