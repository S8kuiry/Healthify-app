package expo.modules.steptracker

import android.os.Handler
import android.os.Looper

object StepTrackerEventDispatcher {
  private var lastEmittedSteps = -1
  private var emitter: ((String, Map<String, Any>) -> Unit)? = null
  private val mainHandler = Handler(Looper.getMainLooper())

  fun setEmitter(fn: (String, Map<String, Any>) -> Unit) {
    emitter = fn
  }

  fun clearEmitter() {
    emitter = null
    lastEmittedSteps = -1
  }

  fun dispatchStepUpdate(steps: Int, calories: Int, date: String) {
    if (steps == lastEmittedSteps) return
    lastEmittedSteps = steps
    val fn = emitter ?: return
    val payload = mapOf("steps" to steps, "calories" to calories, "date" to date)
    mainHandler.post {
      try {
        fn.invoke("onStepUpdate", payload)
      } catch (_: Exception) {
        // React bridge may not be ready yet — ignore rather than crash the app.
      }
    }
  }
}
