package expo.modules.bycodavoice

import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.MediaRecorder

/**
 * Full duplex for a realtime call: the microphone stays open while a reply plays, so speaking can
 * interrupt it. Only a session that asked for echo cancellation and got it runs this way; every other
 * session keeps the half-duplex recognition path (VOICE_RECOGNITION capture, assistant playback).
 */
internal object VoiceDuplexPolicy {
  fun captureSource(duplex: Boolean) = if (duplex) MediaRecorder.AudioSource.VOICE_COMMUNICATION else MediaRecorder.AudioSource.VOICE_RECOGNITION
  /** The platform echo canceller references only voice-communication playback. */
  fun playbackUsage(duplex: Boolean) = if (duplex) AudioAttributes.USAGE_VOICE_COMMUNICATION else AudioAttributes.USAGE_ASSISTANT
  /** Half duplex: starting one direction stops the other. */
  fun exclusive(duplex: Boolean) = !duplex
  /** Duplex is granted only when asked for, with a microphone session and an echo canceller on the device. */
  fun grants(requested: Boolean, microphone: Boolean, echoCancellerAvailable: Boolean) = requested && microphone && echoCancellerAvailable
  /** What the session shows after a reply stops: a capture still open in duplex keeps it listening. */
  fun phaseAfterPlayback(phase: String, capturing: Boolean) = if (phase != "speaking") phase else if (capturing) "recording" else "idle"
  /**
   * The communication route that keeps the call where media audio would go: a wired or USB headset, then a
   * Bluetooth headset, else the loudspeaker (voice communication would otherwise use the earpiece).
   */
  private val routePriority = listOf(
    AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
    AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_BUILTIN_SPEAKER,
  )
  fun communicationRoute(available: List<Int>): Int? = routePriority.firstOrNull { it in available }
  /** Milliseconds of 16-bit mono audio played at [sampleRate]; never negative. */
  fun playedMs(frames: Long, sampleRate: Int) = if (sampleRate <= 0 || frames <= 0) 0L else frames * 1000 / sampleRate
}
