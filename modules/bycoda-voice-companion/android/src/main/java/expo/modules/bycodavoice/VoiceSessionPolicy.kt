package expo.modules.bycodavoice

internal enum class PreparedPlayback { START, HOLD, DISCARD }

/** No background start, stale notification action, or unlimited microphone lifetime. */
internal object VoiceSessionPolicy {
  const val CAPTURE_SAMPLES = 480000
  const val SAMPLE_RATE = 16000
  /** 300 ms of 16 kHz mono PCM16 per bridge event. */
  const val PCM_BATCH_BYTES = 9600
  const val IDLE_TIMEOUT_MS = 180000L
  /** The idle window counts listening time only; a muted call neither times out nor carries a stale window into unmute. */
  fun idleRuns(muted: Boolean) = !muted
  fun matches(active: String?, supplied: String) = !active.isNullOrEmpty() && active == supplied
  fun mayStart(visible: Boolean, unlocked: Boolean, microphoneGranted: Boolean) = visible && unlocked && microphoneGranted
  /**
   * A microphone opened off the main thread may only go live if nothing replaced or stopped the start
   * meanwhile: same session, same pending capture, same generation, operation not canceled, not muted.
   */
  fun captureStillCurrent(sessionAllowed: Boolean, generation: Int, startedGeneration: Int, pendingToken: String?, token: String, operationAllowed: Boolean, muted: Boolean) =
    sessionAllowed && generation == startedGeneration && pendingToken == token && operationAllowed && !muted
  /** A player prepared off the main thread: play it, hold it when focus was lost meanwhile, or drop it if replaced or stopped. */
  fun preparedPlayback(sessionAllowed: Boolean, stillCurrent: Boolean, operationAllowed: Boolean, suspended: Boolean) =
    if (!sessionAllowed || !stillCurrent || !operationAllowed) PreparedPlayback.DISCARD else if (suspended) PreparedPlayback.HOLD else PreparedPlayback.START
}
