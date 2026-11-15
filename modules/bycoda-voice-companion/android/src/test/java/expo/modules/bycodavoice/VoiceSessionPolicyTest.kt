package expo.modules.bycodavoice

import org.junit.Assert.*
import org.junit.Test

class VoiceSessionPolicyTest {
  @Test fun explicitForegroundStartRequiresAllThreeProofs() {
    assertTrue(VoiceSessionPolicy.mayStart(true, true, true))
    assertFalse(VoiceSessionPolicy.mayStart(false, true, true))
    assertFalse(VoiceSessionPolicy.mayStart(true, false, true))
    assertFalse(VoiceSessionPolicy.mayStart(true, true, false))
  }
  @Test fun staleOrEmptyNativeActionsCannotAffectAnotherSession() {
    assertTrue(VoiceSessionPolicy.matches("original", "original"))
    assertFalse(VoiceSessionPolicy.matches("new-session", "original"))
    assertFalse(VoiceSessionPolicy.matches(null, "original"))
    assertFalse(VoiceSessionPolicy.matches("", ""))
    assertEquals(30, VoiceSessionPolicy.CAPTURE_SAMPLES / VoiceSessionPolicy.SAMPLE_RATE)
  }
}
