package expo.modules.bycodafold

import android.app.Activity
import androidx.core.util.Consumer
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowLayoutInfo
import androidx.window.java.layout.WindowInfoTrackerCallbackAdapter
import androidx.window.layout.WindowMetricsCalculator
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.Executor

class BycodaFoldModule : Module() {
  private var adapter: WindowInfoTrackerCallbackAdapter? = null
  private var activity: Activity? = null
  private var last: Map<String, Any?>? = null
  private val mainExecutor = Executor { runnable -> android.os.Handler(android.os.Looper.getMainLooper()).post(runnable) }
  private val listener = Consumer<WindowLayoutInfo> { info -> publish(info) }

  override fun definition() = ModuleDefinition {
    Name("BycodaFold")
    Events("onFoldChange")
    Function("getFoldState") { last }
    OnActivityEntersForeground { attach() }
    OnActivityEntersBackground { detach() }
    OnDestroy { detach() }
  }

  private fun attach() {
    val current = appContext.currentActivity ?: return
    if (activity === current) return
    detach()
    activity = current
    val tracker = WindowInfoTrackerCallbackAdapter(WindowInfoTracker.getOrCreate(current))
    adapter = tracker
    tracker.addWindowLayoutInfoListener(current, mainExecutor, listener)
  }

  private fun detach() {
    adapter?.removeWindowLayoutInfoListener(listener)
    adapter = null
    activity = null
  }

  private fun publish(info: WindowLayoutInfo) {
    val host = activity ?: return
    val fold = info.displayFeatures.filterIsInstance<FoldingFeature>().firstOrNull()
    val next: Map<String, Any?>? = if (fold == null) null else {
      val density = host.resources.displayMetrics.density
      val window = WindowMetricsCalculator.getOrCreate().computeCurrentWindowMetrics(host).bounds
      val b = fold.bounds
      mapOf(
        "posture" to if (fold.state == FoldingFeature.State.HALF_OPENED) "half-opened" else "flat",
        "orientation" to if (fold.orientation == FoldingFeature.Orientation.VERTICAL) "vertical" else "horizontal",
        "hingeBounds" to mapOf(
          "left" to (b.left - window.left) / density.toDouble(),
          "top" to (b.top - window.top) / density.toDouble(),
          "width" to b.width() / density.toDouble(),
          "height" to b.height() / density.toDouble()
        ),
        "isSeparating" to fold.isSeparating
      )
    }
    last = next
    sendEvent("onFoldChange", mapOf("state" to next))
  }
}
