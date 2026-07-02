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
      db.execSQL("PRAGMA journal_mode=WAL;")
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
    } finally {
      db.close()
    }
  }
}