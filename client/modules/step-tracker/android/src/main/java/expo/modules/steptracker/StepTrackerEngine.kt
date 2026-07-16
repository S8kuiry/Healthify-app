package expo.modules.steptracker

import android.content.Context

object StepTrackerEngine {
  private var lastNotifiedSteps = -1
  private var lastNotifiedAtMs = 0L
  private var lastSavedSteps = -1
  private var lastSavedAtMs = 0L

  private const val NOTIFICATION_MIN_MS = 10_000L
  private const val DB_SAVE_MIN_MS = 30_000L
  private const val DB_SAVE_STEP_DELTA = 20

  fun onSensorRaw(context: Context, rawSteps: Int) {
    val todaySteps = StepCounterStore.updateFromRaw(context, rawSteps)
    if (todaySteps < 0) return

    val calories = StepCounterStore.activeCalories(context, todaySteps)
    val date = StepCounterStore.todayDateString()
    val now = System.currentTimeMillis()

    maybeUpdateNotification(context, todaySteps, calories, now)
    maybePersistToday(context, date, todaySteps, calories, now)
    StepTrackerEventDispatcher.dispatchStepUpdate(todaySteps, calories, date)
  }

  fun flush(context: Context) {
    StepCounterStore.persistCurrentSnapshot(context)
    lastSavedSteps = StepCounterStore.getTodaySteps(context).coerceAtLeast(0)
    lastSavedAtMs = System.currentTimeMillis()
  }

  private fun maybeUpdateNotification(context: Context, steps: Int, calories: Int, now: Long) {
    val stepsUnchanged = steps == lastNotifiedSteps
    val tooSoon = now - lastNotifiedAtMs < NOTIFICATION_MIN_MS
    if (stepsUnchanged || tooSoon) return

    StepTrackerNotification.refresh(context)
    lastNotifiedSteps = steps
    lastNotifiedAtMs = now
  }

  private fun maybePersistToday(context: Context, date: String, steps: Int, calories: Int, now: Long) {
    val enoughTimePassed = now - lastSavedAtMs >= DB_SAVE_MIN_MS
    val enoughStepsChanged = steps - lastSavedSteps >= DB_SAVE_STEP_DELTA
    if (!enoughTimePassed && !enoughStepsChanged) return

    val (stepGoal, calorieGoal) = StepCounterStore.goals(context)
    DailyActivityStore.upsert(context, date, steps, calories, stepGoal, calorieGoal)
    lastSavedSteps = steps
    lastSavedAtMs = now
  }

  /**
   * Sync steps from system counter. Called periodically to capture steps
   * that may have occurred while sensor listener wasn't active.
   * Safe to call without breaking sensor-based updates.
   */
  fun syncFromSystemCounter(context: Context, systemRawSteps: Int) {
    val todaySteps = StepCounterStore.syncSystemSteps(context, systemRawSteps)
    if (todaySteps < 0) return

    val calories = StepCounterStore.activeCalories(context, todaySteps)
    val date = StepCounterStore.todayDateString()
    val now = System.currentTimeMillis()

    StepTrackerNotification.refresh(context)
    val (stepGoal, calorieGoal) = StepCounterStore.goals(context)
    DailyActivityStore.upsert(context, date, todaySteps, calories, stepGoal, calorieGoal)
    StepTrackerEventDispatcher.dispatchStepUpdate(todaySteps, calories, date)

    lastSavedSteps = todaySteps
    lastSavedAtMs = now
  }
}