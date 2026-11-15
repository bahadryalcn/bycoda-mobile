package expo.modules.bycodavoice

import org.junit.Assert.*
import org.junit.Test

class VoiceOperationFenceTest {
  @Test fun canceledQueuedStartCannotReviveAnOldUtterance() {
    val fence = VoiceOperationFence()
    assertTrue(fence.allows("1000-1"))
    fence.cancel("1000-1")
    assertFalse(fence.allows("1000-1"))
    assertTrue(fence.allows("1000-2"))
    assertFalse(fence.allows(""))
    fence.cancel("1000-1000")
    assertFalse(fence.allows("1000-1"))
    assertFalse(fence.allows("1001-1"))
    assertTrue(fence.allows("999-1001"))
  }
}
