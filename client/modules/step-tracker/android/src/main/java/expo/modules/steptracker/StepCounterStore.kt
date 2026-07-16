package expo.modules.steptracker

import android.content.Context
import android.content.SharedPreferences
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlin.math.roundToInt

object StepCounterStore {
  private const val PREFS_NAME = "step_tracker_prefs"
  private const val KEY_BASELINE_DATE = "baseline_date"
  private const val KEY_BASELINE_RAW = "baseline_raw"
  private const val KEY_BASELINE_TODAY_STEPS = "baseline_today_steps"
  private const val KEY_HEIGHT_CM = "profile_height_cm"
  private const val KEY_WEIGHT_KG = "profile_weight_kg"
  private const val KEY_STEP_GOAL = "profile_step_goal"
  private const val KEY_CALORIE_GOAL = "profile_calorie_goal"
  private const val KEY_TRACKING_ENABLED = "tracking_enabled"


  private val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.US)

  fun prefs(context: Context): SharedPreferences {
    return context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
  }

  fun todayDateString(): String = dateFormat.format(Date())

  fun setProfileMetrics(context: Context, heightCm: Double, weightKg: Double) {
    prefs(context).edit()
      .putFloat(KEY_HEIGHT_CM, heightCm.toFloat())
      .putFloat(KEY_WEIGHT_KG, weightKg.toFloat())
      .apply()
  }


  /**
   * Set user's profile metrics (height, weight, step goal, calorie goal).
   * Also stores the last recorded date and raw steps.
   */
  fun setActivityProfile(
  context: Context,
  heightCm: Double,
  weightKg: Double,
  stepGoal: Int,
  calorieGoal: Int
) {
  prefs(context).edit()
    .putFloat(KEY_HEIGHT_CM, heightCm.toFloat())
    .putFloat(KEY_WEIGHT_KG, weightKg.toFloat())
    .putInt(KEY_STEP_GOAL, stepGoal)
    .putInt(KEY_CALORIE_GOAL, calorieGoal)
    .apply()
}

fun goals(context: Context): Pair<Int, Int> {
  val p = prefs(context)
  return p.getInt(KEY_STEP_GOAL, 0) to p.getInt(KEY_CALORIE_GOAL, 0)
}

  fun setTrackingEnabled(context: Context, enabled: Boolean) {
    prefs(context).edit().putBoolean(KEY_TRACKING_ENABLED, enabled).apply()
  }

  fun isTrackingEnabled(context: Context): Boolean {
    return prefs(context).getBoolean(KEY_TRACKING_ENABLED, false)
  }

  /**
   * If the calendar day advanced while the service was not running, persist the
   * last known day to SQLite. Prefs are left unchanged so the next sensor event
   * can run the normal rollover baseline reset in [updateFromRaw].
   */
  fun flushStaleDayToDb(context: Context) {
    if (isStoredDateToday(context)) return
    persistCurrentSnapshot(context)
  }

  fun isStoredDateToday(context: Context): Boolean {
    return prefs(context).getString(KEY_BASELINE_DATE, null) == todayDateString()
  }

  /** Persist the in-progress day keyed by [KEY_BASELINE_DATE], whatever calendar day that is. */
  fun persistCurrentSnapshot(context: Context) {
    val p = prefs(context)
    val storedDate = p.getString(KEY_BASELINE_DATE, null) ?: return
    val steps = p.getInt(KEY_BASELINE_TODAY_STEPS, 0)
    val calories = activeCalories(context, steps)
    val (stepGoal, calorieGoal) = goals(context)
    DailyActivityStore.upsert(
      context, storedDate, steps, calories, stepGoal, calorieGoal
    )
  }



/**
 * Calculate calories burned based on steps and user's profile metrics.
 */
  

  fun activeCalories(context: Context, steps: Int): Int {
    if (steps <= 0) return 0

    val p = prefs(context)
    val heightCm = p.getFloat(KEY_HEIGHT_CM, 0f).toDouble()
    val weightKg = p.getFloat(KEY_WEIGHT_KG, 0f).toDouble()
    if (heightCm <= 0 || weightKg <= 0) return 0

    val strideMeters = (heightCm * 0.415) / 100.0
    val distanceKm = (steps * strideMeters) / 1000.0
    return (distanceKm * weightKg * 0.5).roundToInt()
  }

  fun updateFromRaw(context: Context, rawSteps: Int): Int {
    if (rawSteps < 0) return -1

    val p = prefs(context)
    val today = todayDateString()
    val storedDate = p.getString(KEY_BASELINE_DATE, null)

    if (storedDate != null && storedDate != today) {
      val finalSteps = p.getInt(KEY_BASELINE_TODAY_STEPS, 0)
      val finalCalories = activeCalories(context, finalSteps)
      val (stepGoal, calorieGoal) = goals(context)
      DailyActivityStore.upsert(
        context, storedDate, finalSteps, finalCalories, stepGoal, calorieGoal
      )
    }

    if (storedDate != today) {
      p.edit()
        .putString(KEY_BASELINE_DATE, today)
        .putInt(KEY_BASELINE_RAW, rawSteps)
        .putInt(KEY_BASELINE_TODAY_STEPS, 0)
        .apply()
      return 0
    }

    val baselineRaw = p.getInt(KEY_BASELINE_RAW, -1)
    val baselineTodaySteps = p.getInt(KEY_BASELINE_TODAY_STEPS, 0)

    if (baselineRaw < 0) {
      p.edit()
        .putString(KEY_BASELINE_DATE, today)
        .putInt(KEY_BASELINE_RAW, rawSteps)
        .putInt(KEY_BASELINE_TODAY_STEPS, 0)
        .apply()
      return 0
    }

    val todaySteps = if (rawSteps >= baselineRaw) {
      baselineTodaySteps + (rawSteps - baselineRaw)
    } else {
      baselineTodaySteps
    }

    p.edit()
      .putInt(KEY_BASELINE_RAW, rawSteps)
      .putInt(KEY_BASELINE_TODAY_STEPS, todaySteps)
      .apply()

    return todaySteps
  }

  fun getTodaySteps(context: Context): Int {
    val p = prefs(context)
    val today = todayDateString()
    val storedDate = p.getString(KEY_BASELINE_DATE, null)
    if (storedDate != today) return 0
    return p.getInt(KEY_BASELINE_TODAY_STEPS, 0)
  }

  fun getRawStepsSinceReboot(context: Context): Int {
    return prefs(context).getInt(KEY_BASELINE_RAW, -1)
  }

  /**
   * Sync steps from system counter. Returns today's steps, or -1 if sync failed.
   * This is safe to call independently - it doesn't interfere with sensor events.
   * Used when service wasn't running to capture missed steps.
   */
  fun syncSystemSteps(context: Context, currentRawSteps: Int): Int {
    if (currentRawSteps < 0) return -1

    val p = prefs(context)
    val today = todayDateString()
    val storedDate = p.getString(KEY_BASELINE_DATE, null)

    if (storedDate != null && storedDate != today) {
      val finalSteps = p.getInt(KEY_BASELINE_TODAY_STEPS, 0)
      val finalCalories = activeCalories(context, finalSteps)
      val (stepGoal, calorieGoal) = goals(context)
      DailyActivityStore.upsert(
        context, storedDate, finalSteps, finalCalories, stepGoal, calorieGoal
      )
      p.edit()
        .putString(KEY_BASELINE_DATE, today)
        .putInt(KEY_BASELINE_RAW, currentRawSteps)
        .putInt(KEY_BASELINE_TODAY_STEPS, 0)
        .apply()
      return 0
    }

    val baselineRaw = p.getInt(KEY_BASELINE_RAW, -1)
    if (baselineRaw < 0) {
      p.edit()
        .putString(KEY_BASELINE_DATE, today)
        .putInt(KEY_BASELINE_RAW, currentRawSteps)
        .putInt(KEY_BASELINE_TODAY_STEPS, 0)
        .apply()
      return 0
    }

    val baselineTodaySteps = p.getInt(KEY_BASELINE_TODAY_STEPS, 0)
    val todaySteps = if (currentRawSteps >= baselineRaw) {
      baselineTodaySteps + (currentRawSteps - baselineRaw)
    } else {
      baselineTodaySteps
    }

    p.edit()
      .putInt(KEY_BASELINE_RAW, currentRawSteps)
      .putInt(KEY_BASELINE_TODAY_STEPS, todaySteps)
      .apply()

    return todaySteps
  }
}
