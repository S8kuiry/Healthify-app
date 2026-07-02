package expo.modules.steptracker

import android.content.Context

object StepTrackerEngine {
  private var lastNotifiedSteps = -1
  private var lastNotifiedAtMs = 0L
  private var lastSavedSteps = -1
  private var lastSavedAtMs = 0L

  private const val NOTIFICATION_MIN_MS = 60_000L
  private const val DB_SAVE_MIN_MS = 120_000L
  private const val DB_SAVE_STEP_DELTA = 50

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
    val steps = StepCounterStore.getTodaySteps(context)
    val calories = StepCounterStore.activeCalories(context, steps)
    val date = StepCounterStore.todayDateString()
    val (stepGoal, calorieGoal) = StepCounterStore.goals(context)
    DailyActivityStore.upsert(context, date, steps, calories, stepGoal, calorieGoal)
    lastSavedSteps = steps
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
}