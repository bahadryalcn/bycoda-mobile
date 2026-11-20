package expo.modules.bycodavoice

import android.media.AudioManager

internal enum class FocusAction { END, SUSPEND, RESUME, IGNORE }

/**
 * Audio focus changes and what the call does with them. Only a permanent loss ends the call; a transient
 * loss (including "may duck", which speech content must honor by pausing) suspends audio and the same
 * playback resumes on gain. Capture is never resumed natively: the microphone opens only on an explicit
 * JS start, so a suspended capture is stopped and the owner starts a new one.
 */
internal object VoiceFocusPolicy {
  fun action(change: Int, suspendedPlayback: String?, currentPlayback: String?): FocusAction = when (change) {
    AudioManager.AUDIOFOCUS_LOSS -> FocusAction.END
    AudioManager.AUDIOFOCUS_LOSS_TRANSIENT, AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> FocusAction.SUSPEND
    AudioManager.AUDIOFOCUS_GAIN -> if (suspendedPlayback != null && suspendedPlayback == currentPlayback) FocusAction.RESUME else FocusAction.IGNORE
    else -> FocusAction.IGNORE
  }
}
