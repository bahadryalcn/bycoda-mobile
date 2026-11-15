package expo.modules.bycodahostsocket

import org.junit.Assert.*
import org.junit.Test

class VoiceRpcPolicyTest {
  private fun allowed(method: String, op: String? = null, thread: String? = null, project: String? = null, hasThread: Boolean = thread != null) = VoiceRpcPolicy.allowed(method, op, thread, project, "captured-room", "captured-project", hasThread)
  @Test fun backgroundPeerCanOnlyAddressItsCapturedRoomAndProject() {
    for (op in listOf("threads.send", "threads.sendStatus", "threads.messages")) {
      assertTrue(allowed("assistant.request", op, "captured-room"))
      assertFalse(allowed("assistant.request", op, "different-room"))
      assertFalse(allowed("assistant.request", op))
    }
    assertTrue(allowed("assistant.request", "threads.sendIdentity"))
    assertFalse(allowed("assistant.request", "threads.sendIdentity", "captured-room"))
    assertFalse(allowed("projects.get", project = "captured-project"))
    assertFalse(allowed("projects.get", project = "different-project"))
    assertFalse(VoiceRpcPolicy.allowed("projects.get", null, null, "captured-project", "captured-room", null, false))
    assertTrue(VoiceRpcPolicy.allowed("projects.directory", null, null, null, "captured-room", "captured-project", false, true))
    assertFalse(VoiceRpcPolicy.allowed("projects.directory", null, null, "other-project", "captured-room", "captured-project", false, false))
  }
  @Test fun ordinaryWorkspaceAndSetupMethodsRemainUnavailable() {
    for (method in listOf("voice.local.start", "voice.local.transcribe", "voice.local.release", "voice.local.speak", "voice.local.speechNext", "voice.local.keepAlive", "connection.hello", "environment.describe")) assertTrue(allowed(method))
    for (method in listOf("voice.local.setup", "voice.local.models", "voice.cloud.setKey", "voice.realtime.secret", "sessions.send", "terminal.write", "native.execute", "projects.list")) assertFalse(allowed(method))
    for (op in listOf("snapshot", "threads.open", "threads.list", "presence.set", "jobs.create")) assertFalse(allowed("assistant.request", op, "captured-room"))
  }
}
