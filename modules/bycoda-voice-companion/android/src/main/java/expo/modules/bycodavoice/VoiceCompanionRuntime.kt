package expo.modules.bycodavoice

import android.os.Handler
import android.os.Looper
import java.util.concurrent.CopyOnWriteArraySet
import kotlinx.coroutines.CompletableDeferred

/** Process-local authority dies with the service; it is never persisted or automatically restored. */
object VoiceCompanionRuntime {
  @Volatile internal var service: VoiceCompanionService? = null
  @Volatile internal var pending: Pair<String, CompletableDeferred<Unit>>? = null
  private val listeners = CopyOnWriteArraySet<(Map<String, Any?>) -> Unit>()
  private val main = Handler(Looper.getMainLooper())
  fun add(listener: (Map<String, Any?>) -> Unit) { listeners.add(listener) }
  fun remove(listener: (Map<String, Any?>) -> Unit) { listeners.remove(listener) }
  internal fun emit(event: Map<String, Any?>) { main.post { listeners.forEach { it(event) } } }
  /** Used by the dedicated Host voice peer; never grants ordinary workspace authority. */
  fun allowsSession(id: String): Boolean = service?.allowsSession(id) == true
  internal fun state(): Map<String, Any?> = service?.snapshot() ?: mapOf("active" to false, "sessionId" to "", "phase" to "idle", "muted" to false, "pip" to false)
}
