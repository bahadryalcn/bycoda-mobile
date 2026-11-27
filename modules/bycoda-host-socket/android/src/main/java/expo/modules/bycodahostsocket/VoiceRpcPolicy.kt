package expo.modules.bycodahostsocket

/** A background voice peer cannot browse, navigate, execute tools or address another Room. */
internal object VoiceRpcPolicy {
  private val voiceMethods = setOf("voice.local.start", "voice.local.transcribe", "voice.cloud.transcribe", "voice.local.release", "voice.local.speak", "voice.local.speechNext", "voice.local.keepAlive")
  /** The computer-side realtime voice of this call: lease-bound audio, replies and the call's read-only settings. */
  private val realtimeMethods = setOf("voice.realtime.audio", "voice.realtime.next", "voice.realtime.interrupt", "voice.realtime.text", "voice.realtime.end")
  fun allowed(method: String, op: String?, requestedThread: String?, requestedProject: String?, threadId: String, projectId: String?, hasThread: Boolean, emptyParams: Boolean = false): Boolean {
    if (method == "connection.hello" || method == "environment.describe" || method in voiceMethods || method in realtimeMethods) return true
    if (method == "voice.call.settings.get") return emptyParams
    // The realtime voice may speak only for the call's captured Room.
    if (method == "voice.realtime.start") return requestedThread == threadId
    if (method == "projects.directory") return emptyParams
    if (method != "assistant.request") return false
    return when (op) {
      "threads.sendIdentity" -> !hasThread
      "threads.send", "threads.sendStatus", "threads.messages" -> requestedThread == threadId
      else -> false
    }
  }
}
