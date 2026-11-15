package expo.modules.bycodavoice

import android.app.Activity
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.res.Configuration
import android.content.res.ColorStateList
import android.graphics.drawable.Icon
import android.os.Bundle
import android.util.Rational
import android.view.Gravity
import android.view.View
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView

/** Separate native activity keeps the workspace out of the small movable system window. */
class VoiceCompanionActivity : Activity() {
  private var id = ""
  private var entered = false
  private var returning = false
  private lateinit var label: TextView
  private val listener: (Map<String, Any?>) -> Unit = { event ->
    if (event["sessionId"] == id) runOnUiThread {
      val service = VoiceCompanionRuntime.service
      if (service?.allowsSession(id) != true) finish() else update(service)
    }
  }
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    id = intent.getStringExtra("sessionId") ?: ""
    val service = VoiceCompanionRuntime.service
    if (service?.allowsSession(id) != true) { finish(); return }
    val density = resources.displayMetrics.density
    val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL; gravity = Gravity.CENTER; setPadding((12 * density).toInt(), (8 * density).toInt(), (12 * density).toInt(), (8 * density).toInt()); setBackgroundColor(getColor(R.color.bycoda_voice_canvas)) }
    val mark = ImageView(this).apply { setImageResource(R.drawable.bycoda_voice_mark); imageTintList = ColorStateList.valueOf(getColor(R.color.bycoda_voice_foreground)); scaleType = ImageView.ScaleType.FIT_CENTER; contentDescription = "Bycoda" }
    layout.addView(mark, LinearLayout.LayoutParams((32 * density).toInt(), (32 * density).toInt()).apply { bottomMargin = (8 * density).toInt() })
    label = TextView(this).apply { gravity = Gravity.CENTER; textSize = 12f; setTextColor(getColor(R.color.bycoda_voice_secondary)); includeFontPadding = false; maxLines = 2; accessibilityLiveRegion = View.ACCESSIBILITY_LIVE_REGION_POLITE }
    layout.addView(label)
    setContentView(layout)
    VoiceCompanionRuntime.add(listener)
    update(service)
    window.decorView.post {
      if (!isFinishing && service.allowsSession(id)) {
        entered = enterPictureInPictureMode(params(service))
        service.pip = entered; service.publish()
        if (!entered) finish()
      }
    }
  }
  private fun params(service: VoiceCompanionService): PictureInPictureParams {
    val muted = service.snapshot()["muted"] == true
    val mute = getString(if (muted) R.string.bycoda_voice_unmute else R.string.bycoda_voice_mute)
    return PictureInPictureParams.Builder().setAspectRatio(Rational(1, 1)).setActions(listOf(
      RemoteAction(Icon.createWithResource(this, android.R.drawable.ic_lock_silent_mode), mute, mute, service.actionIntent(VoiceCompanionService.ACTION_MUTE)),
      RemoteAction(Icon.createWithResource(this, android.R.drawable.ic_media_pause), getString(R.string.bycoda_voice_stop), getString(R.string.bycoda_voice_stop), service.actionIntent(VoiceCompanionService.ACTION_STOP))
    )).build()
  }
  private fun update(service: VoiceCompanionService) {
    val state = service.snapshot()
    label.text = getString(if (state["muted"] == true) R.string.bycoda_voice_muted else when (state["phase"]) { "recording" -> R.string.bycoda_voice_listening; "speaking" -> R.string.bycoda_voice_speaking; else -> R.string.bycoda_voice_title })
    setPictureInPictureParams(params(service))
  }
  override fun onPictureInPictureModeChanged(inPip: Boolean, configuration: Configuration) {
    super.onPictureInPictureModeChanged(inPip, configuration)
    val service = VoiceCompanionRuntime.service
    service?.takeIf { it.allowsSession(id) }?.let { it.pip = inPip; it.publish() }
  }
  override fun onResume() {
    super.onResume()
    if (entered && !isInPictureInPictureMode) {
      returning = true
      packageManager.getLaunchIntentForPackage(packageName)?.let { startActivity(it) }
      finish()
    }
  }
  override fun onStop() {
    super.onStop()
    if (entered && !isInPictureInPictureMode && !returning) VoiceCompanionRuntime.service?.takeIf { it.allowsSession(id) }?.end("pip-closed")
  }
  override fun onDestroy() { VoiceCompanionRuntime.remove(listener); super.onDestroy() }
}
