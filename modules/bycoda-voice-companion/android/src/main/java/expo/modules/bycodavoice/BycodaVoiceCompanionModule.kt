package expo.modules.bycodavoice

import android.Manifest
import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import java.util.UUID

class BycodaVoiceCompanionModule : Module() {
  private val listener: (Map<String, Any?>) -> Unit = { sendEvent("onVoiceEvent", it) }
  private fun context() = appContext.reactContext ?: error("Voice context is unavailable.")
  private fun main(action: () -> Unit) { if (Looper.myLooper() == Looper.getMainLooper()) action() else Handler(Looper.getMainLooper()).post { action() } }
  private suspend fun beginSession(recording: Boolean): String {
      val ready = CompletableDeferred<Unit>()
      val id = UUID.randomUUID().toString()
      withContext(Dispatchers.Main) {
        val context = context()
        val activity = appContext.currentActivity
        val visible = activity != null && !activity.isFinishing && !activity.isDestroyed && activity.hasWindowFocus()
        val unlocked = !(context.getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).isKeyguardLocked
        check(VoiceSessionPolicy.mayStart(visible, unlocked, !recording || context.checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED)) { "Start voice while Bycoda is visible, unlocked and microphone permission is granted." }
        check(VoiceCompanionRuntime.service == null && VoiceCompanionRuntime.pending == null) { "A voice session is already active." }
        VoiceCompanionRuntime.pending = id to ready
        try {
          val intent = Intent(context, VoiceCompanionService::class.java).putExtra("sessionId", id).putExtra("microphone", recording)
          if (Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent) else context.startService(intent)
        } catch (error: Exception) { VoiceCompanionRuntime.pending = null; throw error }
      }
      return try { withTimeout(5000) { ready.await() }; id }
      catch (error: Exception) {
        withContext(Dispatchers.Main) {
          if (VoiceCompanionRuntime.pending?.first == id) VoiceCompanionRuntime.pending = null
          VoiceCompanionRuntime.service?.takeIf { it.allowsSession(id) }?.end("unavailable")
        }
        throw error
      }
    }
  override fun definition() = ModuleDefinition {
    Name("BycodaVoiceCompanion")
    Events("onVoiceEvent")
    OnCreate { VoiceCompanionRuntime.add(listener) }
    OnDestroy { VoiceCompanionRuntime.remove(listener); VoiceCompanionRuntime.service?.end("revoked") }
    Function("getState") { VoiceCompanionRuntime.state() }
    /** Input devices as {name, type, uid}; type is a coarse kind (builtin, wired, bluetooth, carplay or other). */
    Function("listInputs") {
      val manager = context().getSystemService(Context.AUDIO_SERVICE) as AudioManager
      manager.getDevices(AudioManager.GET_DEVICES_INPUTS).map { device ->
        val kind = when (device.type) {
          AudioDeviceInfo.TYPE_BUILTIN_MIC -> "builtin"
          AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_USB_DEVICE, AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_LINE_ANALOG, AudioDeviceInfo.TYPE_LINE_DIGITAL -> "wired"
          AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_BLE_HEADSET -> "bluetooth"
          else -> "other"
        }
        mapOf("name" to device.productName.toString(), "type" to kind, "uid" to device.id.toString())
      }
    }
    /** The next capture prefers this input; null (or a device that is gone) keeps the default microphone. */
    Function("setPreferredInput") { uid: String? -> VoiceCompanionRuntime.preferredInputId = uid?.toIntOrNull() }
    AsyncFunction("beginSession") Coroutine { -> beginSession(true) }
    AsyncFunction("beginPlaybackSession") Coroutine { -> beginSession(false) }
    // Reserve on main, open the microphone on a worker, commit on main. The last two steps are NonCancellable so a
    // canceled call can never leave an opened microphone behind: commit/abandon always close or adopt it.
    AsyncFunction("startCapture") Coroutine { id: String, captureId: String, batchBytes: Int? ->
      val service = VoiceCompanionRuntime.service ?: error("Voice session is unavailable.")
      val start = withContext(Dispatchers.Main) { service.prepareCapture(id, captureId) }
      withContext(NonCancellable) {
        val opened = try { withContext(Dispatchers.IO) { service.openRecorder(start.duplex) } }
        catch (error: Exception) { withContext(Dispatchers.Main) { service.abandonCapture(start) }; throw error }
        withContext(Dispatchers.Main) { service.commitCapture(start, opened, VoiceSessionPolicy.batchBytes(batchBytes)) }
      }
    }
    Function("stopCapture") { id: String, captureId: String -> main { VoiceCompanionRuntime.service?.stopCapture(id, expectedCapture = captureId) } }
    Function("setMuted") { id: String, muted: Boolean -> main { VoiceCompanionRuntime.service?.setMuted(id, muted) } }
    AsyncFunction("playWav") Coroutine { id: String, playingId: String, uri: String ->
      withContext(Dispatchers.Main) { val service = VoiceCompanionRuntime.service ?: error("Voice session is unavailable."); service.playWav(id, playingId, uri) }
    }
    AsyncFunction("startPcm") Coroutine { id: String, playingId: String, sampleRate: Int ->
      withContext(Dispatchers.Main) { checkNotNull(VoiceCompanionRuntime.service).startPcm(id, playingId, sampleRate) }
    }
    AsyncFunction("appendPcm") Coroutine { id: String, playingId: String, audio: String ->
      val stream = withContext(Dispatchers.Main) { checkNotNull(VoiceCompanionRuntime.service).run { val stream = pcmPlayback(id, playingId); touchPlayback(playingId); stream } }
      withContext(Dispatchers.IO) { stream.append(audio) }
    }
    AsyncFunction("finishPcm") Coroutine { id: String, playingId: String ->
      val stream = withContext(Dispatchers.Main) { checkNotNull(VoiceCompanionRuntime.service).pcmPlayback(id, playingId) }
      withContext(Dispatchers.IO) { stream.drain() }
    }
    /** Milliseconds of a streamed reply the speaker has played (an underrun does not count); 0 when it is not live. */
    Function("pcmPlayedMs") { id: String, playingId: String -> (VoiceCompanionRuntime.service?.pcmPlayedMs(id, playingId) ?: 0L).toDouble() }
    /** Realtime full duplex, asked before the call first listens; resolves whether echo cancellation is active. */
    AsyncFunction("setEchoCancellation") Coroutine { id: String, enabled: Boolean ->
      withContext(Dispatchers.Main) { checkNotNull(VoiceCompanionRuntime.service) { "Voice session is unavailable." }.setEchoCancellation(id, enabled) }
    }
    Function("stopPlayback") { id: String, playingId: String -> main { VoiceCompanionRuntime.service?.stopPlayback(id, expectedPlayback = playingId) } }
    Function("endSession") { id: String -> main {
      VoiceCompanionRuntime.service?.takeIf { VoiceSessionPolicy.matches(it.snapshot()["sessionId"] as? String, id) }?.end("revoked")
      if (VoiceCompanionRuntime.pending?.first == id) { VoiceCompanionRuntime.pending?.second?.completeExceptionally(IllegalStateException("Voice session was revoked.")); VoiceCompanionRuntime.pending = null }
    } }
    AsyncFunction("enterPip") Coroutine { id: String ->
      withContext(Dispatchers.Main) {
        val activity = appContext.currentActivity
        val service = VoiceCompanionRuntime.service
        if (Build.VERSION.SDK_INT < 26 || activity == null || !activity.hasWindowFocus() || service?.allowsSession(id) != true || !activity.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)) false
        else { activity.startActivity(Intent(activity, VoiceCompanionActivity::class.java).putExtra("sessionId", id)); true }
      }
    }
  }
}
