package expo.modules.bycodavoice

/** No background start, stale notification action, or unlimited microphone lifetime. */
internal object VoiceSessionPolicy {
  const val CAPTURE_SAMPLES = 480000
  const val SAMPLE_RATE = 16000
  const val IDLE_TIMEOUT_MS = 180000L
  fun matches(active: String?, supplied: String) = !active.isNullOrEmpty() && active == supplied
  fun mayStart(visible: Boolean, unlocked: Boolean, microphoneGranted: Boolean) = visible && unlocked && microphoneGranted
}
