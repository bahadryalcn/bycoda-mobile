package expo.modules.bycodavoice

import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.os.Build
import android.util.Base64
import kotlinx.coroutines.delay
import kotlinx.coroutines.withTimeout

/** One bounded PCM buffer and one playback head for the whole spoken reply. */
internal class PcmPlayback(val sampleRate: Int, attributes: AudioAttributes) {
  private val lock = Any()
  private var track: AudioTrack? = null
  private var written = 0

  init {
    require(sampleRate in 8000..96000) { "Invalid speech sample rate." }
    val format = AudioFormat.Builder()
      .setSampleRate(sampleRate).setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
      .setEncoding(AudioFormat.ENCODING_PCM_16BIT).build()
    val minimum = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_MONO, AudioFormat.ENCODING_PCM_16BIT)
    check(minimum > 0) { "Speech playback is unavailable." }
    val player = AudioTrack.Builder().setAudioAttributes(attributes).setAudioFormat(format)
      .setTransferMode(AudioTrack.MODE_STREAM).setBufferSizeInBytes(maxOf(minimum, sampleRate * 3)).build()
    try {
      check(player.state == AudioTrack.STATE_INITIALIZED) { "Speech playback is unavailable." }
      if (Build.VERSION.SDK_INT >= 31) player.setStartThresholdInFrames(minOf(player.bufferSizeInFrames, sampleRate / 6))
      player.play()
      track = player
    } catch (error: Exception) {
      player.release()
      throw error
    }
  }

  suspend fun append(audio: String) = withTimeout(120_000) {
    require(audio.length in 1..1_000_000) { "Invalid speech audio." }
    val pcm = Base64.decode(audio, Base64.DEFAULT)
    require(pcm.isNotEmpty() && pcm.size % 2 == 0) { "Invalid speech audio." }
    var offset = 0
    while (offset < pcm.size) {
      val accepted = synchronized(lock) {
        val player = track ?: return@withTimeout
        player.write(pcm, offset, pcm.size - offset, AudioTrack.WRITE_NON_BLOCKING).also {
          check(it >= 0) { "Speech playback failed." }
          written += it
        }
      }
      // A full 3 s buffer frees ~640 bytes per 20 ms at 16 kHz; polling faster only adds wakeups.
      if (accepted == 0) delay(20)
      offset += accepted
    }
  }

  suspend fun drain() = withTimeout(120_000) {
    synchronized(lock) {
      if (Build.VERSION.SDK_INT >= 31) track?.setStartThresholdInFrames(1)
    }
    // A 40 ms poll ends a reply imperceptibly later than a 15 ms one, with about a third of the wakeups.
    while (synchronized(lock) { track?.let { it.playbackHeadPosition < written / 2 } == true }) delay(40)
  }

  /** Frames the speaker has actually played (an underrun does not advance it); kept after close. */
  private var played = 0L
  fun playedMs(): Long = synchronized(lock) {
    track?.let { played = maxOf(played, it.playbackHeadPosition.toLong() and 0xffffffffL) }
    VoiceDuplexPolicy.playedMs(played, sampleRate)
  }

  fun pause() = synchronized(lock) { track?.pause() }
  fun resume() = synchronized(lock) { track?.play() }
  fun close() = synchronized(lock) {
    val player = track ?: return@synchronized
    played = maxOf(played, player.playbackHeadPosition.toLong() and 0xffffffffL)
    track = null
    try { player.pause(); player.flush() } finally { player.release() }
  }
}
