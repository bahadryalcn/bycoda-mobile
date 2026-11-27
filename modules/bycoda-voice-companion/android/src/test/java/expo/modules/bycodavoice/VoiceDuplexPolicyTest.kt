package expo.modules.bycodavoice

import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.MediaRecorder
import org.junit.Assert.*
import org.junit.Test

class VoiceDuplexPolicyTest {
  @Test fun onlyAnEchoCancelledRealtimeCallChangesTheAudioPath() {
    assertEquals(MediaRecorder.AudioSource.VOICE_RECOGNITION, VoiceDuplexPolicy.captureSource(false))
    assertEquals(MediaRecorder.AudioSource.VOICE_COMMUNICATION, VoiceDuplexPolicy.captureSource(true))
    assertEquals(AudioAttributes.USAGE_ASSISTANT, VoiceDuplexPolicy.playbackUsage(false))
    assertEquals(AudioAttributes.USAGE_VOICE_COMMUNICATION, VoiceDuplexPolicy.playbackUsage(true))
    assertTrue(VoiceDuplexPolicy.exclusive(false))
    assertFalse(VoiceDuplexPolicy.exclusive(true))
  }
  @Test fun duplexNeedsTheRequestAMicrophoneAndAnEchoCanceller() {
    assertTrue(VoiceDuplexPolicy.grants(true, true, true))
    assertFalse(VoiceDuplexPolicy.grants(false, true, true))
    assertFalse(VoiceDuplexPolicy.grants(true, false, true))   // playback-only session
    assertFalse(VoiceDuplexPolicy.grants(true, true, false))   // no echo canceller: half duplex + tap
  }
  @Test fun aStoppedReplyLeavesAnOpenDuplexCaptureListening() {
    assertEquals("recording", VoiceDuplexPolicy.phaseAfterPlayback("speaking", true))
    assertEquals("idle", VoiceDuplexPolicy.phaseAfterPlayback("speaking", false))
    assertEquals("recording", VoiceDuplexPolicy.phaseAfterPlayback("recording", true))
    assertEquals("idle", VoiceDuplexPolicy.phaseAfterPlayback("idle", false))
  }
  @Test fun theCallFollowsHeadsetThenBluetoothElseTheLoudspeaker() {
    val speaker = AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
    val earpiece = AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
    assertEquals(speaker, VoiceDuplexPolicy.communicationRoute(listOf(earpiece, speaker)))
    assertEquals(AudioDeviceInfo.TYPE_BLUETOOTH_SCO, VoiceDuplexPolicy.communicationRoute(listOf(earpiece, speaker, AudioDeviceInfo.TYPE_BLUETOOTH_SCO)))
    assertEquals(AudioDeviceInfo.TYPE_WIRED_HEADSET, VoiceDuplexPolicy.communicationRoute(listOf(AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_WIRED_HEADSET, speaker)))
    assertNull(VoiceDuplexPolicy.communicationRoute(listOf(earpiece)))
  }
  @Test fun playedFramesBecomeMilliseconds() {
    assertEquals(0L, VoiceDuplexPolicy.playedMs(0, 24000))
    assertEquals(0L, VoiceDuplexPolicy.playedMs(-5, 24000))
    assertEquals(0L, VoiceDuplexPolicy.playedMs(2400, 0))
    assertEquals(100L, VoiceDuplexPolicy.playedMs(2400, 24000))
    assertEquals(1500L, VoiceDuplexPolicy.playedMs(36000, 24000))
  }
}
