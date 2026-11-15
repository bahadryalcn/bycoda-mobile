package expo.modules.bycodahostsocket

/** A background voice peer cannot browse, navigate, execute tools or address another Room. */
internal object VoiceRpcPolicy {
  private val voiceMethods = setOf("voice.local.start", "voice.local.transcribe", "voice.local.release", "voice.local.speak", "voice.local.speechNext", "voice.local.keepAlive")
  fun allowed(method: String, op: String?, requestedThread: String?, requestedProject: String?, threadId: String, projectId: String?, hasThread: Boolean, emptyParams: Boolean = false): Boolean {
    if (method == "connection.hello" || method == "environment.describe" || method in voiceMethods) return true
    if (method == "projects.directory") return emptyParams
    if (method != "assistant.request") return false
    return when (op) {
      "threads.sendIdentity" -> !hasThread
      "threads.send", "threads.sendStatus", "threads.messages" -> requestedThread == threadId
      else -> false
    }
  }
}
