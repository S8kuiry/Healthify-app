package expo.modules.steptracker

object StepTrackerEventDispatcher {
  private var lastEmittedSteps = -1
  private var emitter: ((String, Map<String, Any>) -> Unit)? = null

  fun setEmitter(fn: (String, Map<String, Any>) -> Unit) {
    emitter = fn
  }

  fun clearEmitter() {
    emitter = null
  }

  fun dispatchStepUpdate(steps: Int, calories: Int, date: String) {
    if (steps == lastEmittedSteps) return
    lastEmittedSteps = steps
    emitter?.invoke(
      "onStepUpdate",
      mapOf("steps" to steps, "calories" to calories, "date" to date)
    )
  }
}