package expo.modules.bycodavoice

/** Retire the ordered operation prefix, so even very late queued starts stay canceled. */
internal class VoiceOperationFence {
  private var retired = -1L
  private fun order(id: String): Long? {
    if (!Regex("[0-9]{1,16}-[0-9]{1,16}").matches(id)) return null
    // Wall time provides uniqueness only; cancellation follows this runtime's monotonic sequence.
    return id.substringAfterLast('-').toLongOrNull()
  }
  fun allows(id: String): Boolean {
    val candidate = order(id) ?: return false
    return candidate > retired
  }
  fun cancel(id: String) {
    val candidate = order(id) ?: return
    if (candidate > retired) retired = candidate
  }
}
