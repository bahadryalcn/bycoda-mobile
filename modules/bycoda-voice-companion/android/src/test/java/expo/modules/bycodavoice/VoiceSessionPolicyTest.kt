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
  @Test fun microphoneOpenedOffMainGoesLiveOnlyWhenTheReservationIsUntouched() {
    fun current(session: Boolean = true, generation: Int = 5, pending: String? = "1-1", allowed: Boolean = true, muted: Boolean = false) =
      VoiceSessionPolicy.captureStillCurrent(session, generation, 5, pending, "1-1", allowed, muted)
    assertTrue(current())
    assertFalse(current(session = false))      // call ended or replaced while opening
    assertFalse(current(generation = 6))       // stopCapture bumped the generation
    assertFalse(current(pending = null))       // reservation cleared by stop/mute/end
    assertFalse(current(pending = "1-2"))      // another capture took over
    assertFalse(current(allowed = false))      // explicit stop canceled the operation
    assertFalse(current(muted = true))         // muted while the microphone was opening
  }
  @Test fun playbackPreparedOffMainStartsHoldsOrIsDropped() {
    assertEquals(PreparedPlayback.START, VoiceSessionPolicy.preparedPlayback(true, true, true, false))
    assertEquals(PreparedPlayback.HOLD, VoiceSessionPolicy.preparedPlayback(true, true, true, true))
    assertEquals(PreparedPlayback.DISCARD, VoiceSessionPolicy.preparedPlayback(false, true, true, false))
    assertEquals(PreparedPlayback.DISCARD, VoiceSessionPolicy.preparedPlayback(true, false, true, false))
    assertEquals(PreparedPlayback.DISCARD, VoiceSessionPolicy.preparedPlayback(true, true, false, true))
  }
  @Test fun idleWindowRunsOnlyWhileUnmuted() {
    assertTrue(VoiceSessionPolicy.idleRuns(false))
    assertFalse(VoiceSessionPolicy.idleRuns(true))
  }
  @Test fun staleOrEmptyNativeActionsCannotAffectAnotherSession() {
    assertTrue(VoiceSessionPolicy.matches("original", "original"))
    assertFalse(VoiceSessionPolicy.matches("new-session", "original"))
    assertFalse(VoiceSessionPolicy.matches(null, "original"))
    assertFalse(VoiceSessionPolicy.matches("", ""))
    assertEquals(30, VoiceSessionPolicy.CAPTURE_SAMPLES / VoiceSessionPolicy.SAMPLE_RATE)
  }
}
