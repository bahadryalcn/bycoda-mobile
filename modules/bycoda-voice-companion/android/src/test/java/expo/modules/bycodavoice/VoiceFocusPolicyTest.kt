package expo.modules.bycodavoice

import android.media.AudioManager
import org.junit.Assert.*
import org.junit.Test

class VoiceFocusPolicyTest {
  @Test fun onlyPermanentLossEndsTheCall() {
    assertEquals(FocusAction.END, VoiceFocusPolicy.action(AudioManager.AUDIOFOCUS_LOSS, null, null))
    assertEquals(FocusAction.END, VoiceFocusPolicy.action(AudioManager.AUDIOFOCUS_LOSS, "1-1", "1-1"))
  }
  @Test fun transientAndMayDuckLossSuspendInsteadOfEnding() {
    assertEquals(FocusAction.SUSPEND, VoiceFocusPolicy.action(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT, null, "1-1"))
    assertEquals(FocusAction.SUSPEND, VoiceFocusPolicy.action(AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK, null, null))
  }
  @Test fun gainResumesOnlyThePlaybackThatWasSuspended() {
    assertEquals(FocusAction.RESUME, VoiceFocusPolicy.action(AudioManager.AUDIOFOCUS_GAIN, "1-2", "1-2"))
    // Nothing suspended, a different playback now, or no playback: gain never starts audio on its own.
    assertEquals(FocusAction.IGNORE, VoiceFocusPolicy.action(AudioManager.AUDIOFOCUS_GAIN, null, "1-2"))
    assertEquals(FocusAction.IGNORE, VoiceFocusPolicy.action(AudioManager.AUDIOFOCUS_GAIN, "1-1", "1-2"))
    assertEquals(FocusAction.IGNORE, VoiceFocusPolicy.action(AudioManager.AUDIOFOCUS_GAIN, "1-1", null))
  }
  @Test fun unknownChangesAreIgnored() {
    assertEquals(FocusAction.IGNORE, VoiceFocusPolicy.action(0, "1-1", "1-1"))
    assertEquals(FocusAction.IGNORE, VoiceFocusPolicy.action(99, null, null))
  }
}
