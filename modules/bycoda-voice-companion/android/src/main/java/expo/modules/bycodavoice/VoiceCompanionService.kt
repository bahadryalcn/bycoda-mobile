package expo.modules.bycodavoice

import android.Manifest
import android.app.*
import android.content.*
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.media.AudioFormat
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.AudioRecord
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.os.*
import android.util.Base64
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/** Native audio owner: notification Mute and Stop work even while JS is suspended or the screen is locked. */
class VoiceCompanionService : Service() {
  companion object {
    const val CHANNEL = "bycoda-voice"
    const val NOTIFICATION = 4072
    const val ACTION_STOP = "bycoda.voice.STOP"
    const val ACTION_MUTE = "bycoda.voice.MUTE"
  }
  @Volatile private var id = ""
  @Volatile private var phase = "idle"
  @Volatile private var muted = false
  @Volatile internal var pip = false
  @Volatile private var ended = false
  private var microphone = false
  private val capturing = AtomicBoolean(false)
  private val captureGeneration = AtomicInteger(0)
  private var recorder: AudioRecord? = null
  private var captureId: String? = null
  private val captureOperations = VoiceOperationFence()
  private val playbackOperations = VoiceOperationFence()
  private var player: MediaPlayer? = null
  private var pcm: PcmPlayback? = null
  private var playbackId: String? = null
  /** The current player finished prepareAsync; only then may it be started or paused. */
  private var playerPrepared = false
  /** Playback paused by a transient focus loss; the same playback resumes on gain, nothing else does. */
  private var suspendedPlayback: String? = null
  private var focusRequest: AudioFocusRequest? = null
  private var focusHeld = false
  private val audioAttributes = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ASSISTANT).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build()
  private val handler = Handler(Looper.getMainLooper())
  private val idleStop = Runnable { end("timeout") }
  private val captureLimit = Runnable { stopCapture(id, "limit") }
  private val playbackLimit = Runnable { stopPlayback(id, "Speech playback timed out.") }
  private val focusListener = AudioManager.OnAudioFocusChangeListener { change -> handler.post { onFocusChange(change) } }
  private fun onFocusChange(change: Int) {
    if (ended) return
    when (VoiceFocusPolicy.action(change, suspendedPlayback, playbackId)) {
      FocusAction.END -> end("audio-interrupted")
      FocusAction.SUSPEND -> suspendForFocus()
      FocusAction.RESUME -> resumeAfterFocus()
      FocusAction.IGNORE -> Unit
    }
  }
  /** A capture is stopped (never silently resumed); a playback pauses and keeps focus so gain can resume it. */
  private fun suspendForFocus() {
    if (captureId != null) stopCapture(id, "focus-lost")
    val playing = playbackId ?: return
    val stream = pcm
    val current = player
    if (current == null && stream == null) return
    suspendedPlayback = playing
    try { stream?.pause(); if (playerPrepared) current?.pause() } catch (_: Exception) { }
  }
  private fun resumeAfterFocus() {
    val stream = pcm
    val current = player
    if (current == null && stream == null) return
    suspendedPlayback = null
    if (stream == null && !playerPrepared) return
    try { stream?.resume(); current?.start(); armIdle() } catch (_: Exception) { stopPlayback(id, "Speech playback failed.") }
  }
  private fun acquireFocus() {
    if (focusHeld) return
    val manager = getSystemService(AUDIO_SERVICE) as AudioManager
    val result = if (Build.VERSION.SDK_INT >= 26) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT).setAudioAttributes(audioAttributes).setOnAudioFocusChangeListener(focusListener, handler).build()
      focusRequest = request; manager.requestAudioFocus(request)
    } else manager.requestAudioFocus(focusListener, AudioManager.STREAM_MUSIC, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
    check(result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { "Audio is in use by another app. Try voice again when it is available." }
    focusHeld = true
  }
  private fun releaseFocus() {
    if (!focusHeld) return
    focusHeld = false
    val manager = getSystemService(AUDIO_SERVICE) as AudioManager
    if (Build.VERSION.SDK_INT >= 26) focusRequest?.let { manager.abandonAudioFocusRequest(it) } else manager.abandonAudioFocus(focusListener)
    focusRequest = null
  }
  private fun unlocked() = !(getSystemService(KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked && (getSystemService(POWER_SERVICE) as PowerManager).isInteractive
  // A started call continues with the screen off or locked, like a phone call; only starting
  // needs an unlocked, visible app. The ongoing notification keeps Mute and Stop reachable.
  fun allowsSession(supplied: String) = !ended && VoiceSessionPolicy.matches(id, supplied)
  fun snapshot(): Map<String, Any?> = mapOf("active" to (!ended && id.isNotEmpty()), "sessionId" to id, "phase" to phase, "muted" to muted, "pip" to pip)
  internal fun publish() { VoiceCompanionRuntime.emit(mapOf("type" to "state", "sessionId" to id, "state" to snapshot())) }
  /** Muted time is not idle time: the idle window only runs while unmuted and restarts on unmute. */
  private fun armIdle() { handler.removeCallbacks(idleStop); if (VoiceSessionPolicy.idleRuns(muted)) handler.postDelayed(idleStop, VoiceSessionPolicy.IDLE_TIMEOUT_MS) }
  override fun onCreate() {
    super.onCreate()
    if (Build.VERSION.SDK_INT >= 26) (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(NotificationChannel(CHANNEL, getString(R.string.bycoda_voice_channel), NotificationManager.IMPORTANCE_LOW))
  }
  override fun onBind(intent: Intent?) = null
  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val requested = intent?.getStringExtra("sessionId") ?: return START_NOT_STICKY
    if (intent.action == ACTION_STOP || intent.action == ACTION_MUTE) {
      if (allowsSession(requested)) {
        if (intent.action == ACTION_STOP) end("stopped") else setMuted(requested, !muted)
      }
      return START_NOT_STICKY
    }
    if (ended || !unlocked() || VoiceCompanionRuntime.pending?.first != requested) {
      stopSelf(); return START_NOT_STICKY
    }
    id = requested
    microphone = intent.getBooleanExtra("microphone", false)
    try {
      val types = ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK or (if (microphone) ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE else 0)
      if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION, notification(), types) else startForeground(NOTIFICATION, notification())
      VoiceCompanionRuntime.service = this
      VoiceCompanionRuntime.pending?.second?.complete(Unit)
      VoiceCompanionRuntime.pending = null
      armIdle(); publish()
    } catch (error: Exception) {
      VoiceCompanionRuntime.pending?.second?.completeExceptionally(error)
      VoiceCompanionRuntime.pending = null
      end("unavailable")
    }
    return START_NOT_STICKY
  }
  internal fun actionIntent(action: String): PendingIntent = PendingIntent.getService(this, action.hashCode(), Intent(this, VoiceCompanionService::class.java).setAction(action).putExtra("sessionId", id), PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
  private fun notification(): Notification {
    val open = packageManager.getLaunchIntentForPackage(packageName)
    val builder = (if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)).setSmallIcon(android.R.drawable.ic_btn_speak_now)
      .setContentTitle(getString(R.string.bycoda_voice_title)).setContentText(getString(if (muted) R.string.bycoda_voice_muted else if (phase == "recording") R.string.bycoda_voice_listening else if (phase == "speaking") R.string.bycoda_voice_speaking else R.string.bycoda_voice_idle))
      .setOngoing(true).setOnlyAlertOnce(true).setVisibility(Notification.VISIBILITY_PUBLIC)
      .addAction(Notification.Action.Builder(null, getString(if (muted) R.string.bycoda_voice_unmute else R.string.bycoda_voice_mute), actionIntent(ACTION_MUTE)).build())
      .addAction(Notification.Action.Builder(null, getString(R.string.bycoda_voice_stop), actionIntent(ACTION_STOP)).build())
    if (open != null) builder.setContentIntent(PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
    return builder.build()
  }
  private fun updated() { (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIFICATION, notification()); publish() }
  /** A capture start reserved on the main thread; the microphone opens off it and must still match to go live. */
  internal class CaptureStart(val sessionId: String, val token: String, val generation: Int)
  /** Main thread, step 1 of 3: validate, take focus and reserve the capture so mute, stop or end can cancel it. */
  internal fun prepareCapture(supplied: String, captureToken: String): CaptureStart {
    check(allowsSession(supplied)) { "Voice session is unavailable." }
    check(microphone) { "This voice session is playback-only." }
    check(captureOperations.allows(captureToken)) { "This recording operation was canceled." }
    check(checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED) { "Microphone permission is required." }
    check(!muted && !capturing.get() && captureId == null) { "Microphone is muted or already recording." }
    stopPlayback(supplied)
    acquireFocus()
    captureId = captureToken
    return CaptureStart(supplied, captureToken, captureGeneration.incrementAndGet())
  }
  /** Any thread, step 2 of 3: the blocking AudioRecord construction and start. Touches no service state. */
  internal fun openRecorder(): AudioRecord {
    val size = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    check(size > 0) { "Microphone configuration is unavailable." }
    val next = AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, maxOf(size, 6400))
    if (next.state != AudioRecord.STATE_INITIALIZED) { next.release(); error("Microphone could not start.") }
    // Preferred microphone: a missing or rejected device silently keeps the system default.
    VoiceCompanionRuntime.preferredInputId?.let { wanted ->
      (getSystemService(Context.AUDIO_SERVICE) as AudioManager).getDevices(AudioManager.GET_DEVICES_INPUTS).firstOrNull { it.id == wanted }?.let { runCatching { next.setPreferredDevice(it) } }
    }
    try { next.startRecording() } catch (error: Exception) { next.release(); throw error }
    return next
  }
  private fun releaseFocusIfIdle() { if (phase == "idle" && !capturing.get() && player == null) releaseFocus() }
  /** Main thread, step 3 of 3 when opening failed: drop the reservation and any focus nothing else needs. */
  internal fun abandonCapture(start: CaptureStart) {
    if (captureId == start.token && captureGeneration.get() == start.generation) captureId = null
    releaseFocusIfIdle()
  }
  /** Main thread, step 3 of 3: go live only if the reservation is untouched; otherwise close the microphone again. */
  internal fun commitCapture(start: CaptureStart, next: AudioRecord) {
    if (!VoiceSessionPolicy.captureStillCurrent(allowsSession(start.sessionId), captureGeneration.get(), start.generation, captureId, start.token, captureOperations.allows(start.token), muted)) {
      try { next.stop() } catch (_: Exception) { }
      next.release()
      releaseFocusIfIdle()
      error("This recording operation was canceled.")
    }
    val version = start.generation
    val captureToken = start.token
    recorder = next; capturing.set(true); phase = "recording"; armIdle(); updated()
    handler.postDelayed(captureLimit, 30000)
    val capturedId = id
    Thread({
      // 300 ms batches (9600 bytes at 16 kHz PCM16): one bridge event per batch instead of one per 100 ms read.
      val batcher = VoicePcmBatcher(VoiceSessionPolicy.PCM_BATCH_BYTES, VoiceSessionPolicy.CAPTURE_SAMPLES) { audio, size ->
        VoiceCompanionRuntime.emit(mapOf("type" to "pcm", "sessionId" to capturedId, "captureId" to captureToken, "audio" to Base64.encodeToString(audio, 0, size, Base64.NO_WRAP), "sampleRate" to 16000))
      }
      try {
        while (capturing.get() && captureGeneration.get() == version && allowsSession(capturedId)) {
          val count = next.read(batcher.buffer, batcher.offset, batcher.space())
          if (count <= 0) { if (capturing.get()) throw IllegalStateException("Microphone read failed."); break }
          if (!capturing.get() || captureGeneration.get() != version || !allowsSession(capturedId)) break
          batcher.accepted(count)
          if (batcher.finished) { handler.post { if (captureGeneration.get() == version) stopCapture(capturedId, "limit") }; break }
        }
      } catch (error: Exception) { if (capturing.get() && captureGeneration.get() == version) handler.post { if (captureGeneration.get() == version) end("capture-error", error.message) } }
    }, "BycodaVoiceCapture").start()
  }
  fun stopCapture(supplied: String, reason: String? = null, expectedCapture: String? = null) {
    if (!VoiceSessionPolicy.matches(id, supplied)) return
    if (expectedCapture != null) captureOperations.cancel(expectedCapture)
    if (expectedCapture != null && captureId != expectedCapture) return
    val stoppedCapture = captureId; captureId = null
    stoppedCapture?.let { captureOperations.cancel(it) }
    handler.removeCallbacks(captureLimit)
    captureGeneration.incrementAndGet()
    val wasCapturing = capturing.getAndSet(false)
    val previous = recorder; recorder = null
    try { previous?.stop() } catch (_: Exception) { }
    previous?.release()
    if (phase == "recording") phase = "idle"
    if (phase == "idle") releaseFocus()
    if (!ended) { armIdle(); updated() }
    if (wasCapturing && reason != null) VoiceCompanionRuntime.emit(mapOf("type" to "ended", "sessionId" to id, "captureId" to stoppedCapture, "reason" to reason))
  }
  fun setMuted(supplied: String, value: Boolean) {
    if (!allowsSession(supplied)) return
    muted = value
    if (value) stopCapture(supplied, "muted")
    // Re-evaluate after stopCapture (which re-arms): mute disarms the timer, unmute starts a fresh window. Never opens the microphone.
    if (!ended) armIdle()
    updated()
  }
  fun playWav(supplied: String, playingId: String, uri: String) {
    check(allowsSession(supplied)) { "Voice session is unavailable." }
    check(playbackOperations.allows(playingId)) { "This playback operation was canceled." }
    val file = File(android.net.Uri.parse(uri).path ?: "").canonicalFile
    check(file.path.startsWith(cacheDir.canonicalPath + File.separator) && file.name.startsWith("bycoda-voice-") && file.extension == "wav" && file.length() in 44..8000044) { "Invalid cached voice audio." }
    stopCapture(supplied); stopPlayback(supplied)
    val next = MediaPlayer()
    try {
      acquireFocus(); next.setAudioAttributes(audioAttributes)
      next.setDataSource(file.path)
      next.setOnCompletionListener { if (player === next) stopPlayback(supplied) }
      next.setOnErrorListener { _, what, _ -> if (player === next) stopPlayback(supplied, "Speech playback failed ($what)."); true }
      // Prepared off the main thread: a failure or cancel arrives as a playback event / stopPlayback, never as a stall.
      next.setOnPreparedListener {
        when (VoiceSessionPolicy.preparedPlayback(allowsSession(supplied), player === next, playbackOperations.allows(playingId), suspendedPlayback == playingId)) {
          PreparedPlayback.START -> try { playerPrepared = true; next.start(); armIdle() } catch (_: Exception) { stopPlayback(supplied, "Speech playback failed.") }
          PreparedPlayback.HOLD -> playerPrepared = true
          PreparedPlayback.DISCARD -> Unit
        }
      }
      player = next; playbackId = playingId; playerPrepared = false; suspendedPlayback = null; phase = "speaking"
      handler.postDelayed(playbackLimit, 120000)
      next.prepareAsync()
      armIdle(); updated()
    } catch (error: Exception) {
      handler.removeCallbacks(playbackLimit)
      if (player === next) { player = null; playbackId = null; playerPrepared = false; suspendedPlayback = null; if (phase == "speaking") phase = "idle" }
      next.release(); releaseFocus(); throw error
    }
  }
  fun startPcm(supplied: String, playingId: String, sampleRate: Int) {
    check(allowsSession(supplied) && playbackOperations.allows(playingId)) { "Voice session is unavailable." }
    stopCapture(supplied); stopPlayback(supplied)
    acquireFocus()
    try { pcm = PcmPlayback(sampleRate, audioAttributes) }
    catch (error: Exception) { releaseFocus(); throw error }
    playbackId = playingId
    phase = "speaking"
    handler.postDelayed(playbackLimit, 120000)
    armIdle(); updated()
  }

  internal fun pcmPlayback(supplied: String, playingId: String): PcmPlayback {
    check(allowsSession(supplied) && playbackId == playingId) { "Voice session is unavailable." }
    return checkNotNull(pcm) { "Voice stream is unavailable." }
  }

  fun stopPlayback(supplied: String, error: String? = null, expectedPlayback: String? = null) {
    if (!VoiceSessionPolicy.matches(id, supplied)) return
    if (expectedPlayback != null) playbackOperations.cancel(expectedPlayback)
    if (expectedPlayback != null && playbackId != expectedPlayback) return
    handler.removeCallbacks(playbackLimit)
    val previous = player; player = null
    val previousPcm = pcm; pcm = null
    val previousId = playbackId; playbackId = null
    playerPrepared = false; suspendedPlayback = null
    previousId?.let { playbackOperations.cancel(it) }
    try { previous?.stop() } catch (_: Exception) { }
    previous?.release()
    try { previousPcm?.close() } catch (_: Exception) { }
    if (phase == "speaking") phase = "idle"
    if (phase == "idle") releaseFocus()
    if (previousId != null) VoiceCompanionRuntime.emit(mapOf("type" to "playback", "sessionId" to id, "playbackId" to previousId, "error" to error))
    if (!ended) updated()
  }
  internal fun end(reason: String, error: String? = null) {
    if (ended) return
    ended = true
    // A call that ends on its own otherwise leaves no trace of why (focus loss, capture error, timeout).
    android.util.Log.w("BycodaVoice", "session ended: $reason${if (error != null) " (${error.take(160)})" else ""}")
    handler.removeCallbacksAndMessages(null)
    stopCapture(id); stopPlayback(id)
    if (VoiceCompanionRuntime.service === this) VoiceCompanionRuntime.service = null
    VoiceCompanionRuntime.emit(mapOf("type" to "ended", "sessionId" to id, "reason" to reason, "error" to error))
    publish(); stopForeground(STOP_FOREGROUND_REMOVE); stopSelf()
  }
  override fun onTaskRemoved(rootIntent: Intent?) { end("task-removed"); super.onTaskRemoved(rootIntent) }
  override fun onDestroy() { end("destroyed"); super.onDestroy() }
}
