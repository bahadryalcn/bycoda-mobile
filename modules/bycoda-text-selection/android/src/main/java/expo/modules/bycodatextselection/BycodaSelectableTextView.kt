package expo.modules.bycodatextselection

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Typeface
import android.os.Build
import android.os.SystemClock
import android.text.Layout
import android.text.SpannableString
import android.text.Spanned
import android.text.TextPaint
import android.text.style.LineHeightSpan
import android.text.style.MetricAffectingSpan
import android.text.style.StrikethroughSpan
import android.util.TypedValue
import android.view.ActionMode
import android.view.InputDevice
import android.view.Menu
import android.view.MenuItem
import android.view.MotionEvent
import android.view.View
import android.view.ViewConfiguration
import android.widget.LinearLayout
import android.widget.TextView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.ceil
import kotlin.math.floor

class SelectableRun : Record {
  @Field val start: Int = 0
  @Field val end: Int = 0
  @Field val weight: String? = null
  @Field val italic: Boolean = false
  @Field val mono: Boolean = false
  @Field val strike: Boolean = false
  @Field val size: Double? = null
}

class SelectableAction : Record {
  @Field val id: String = ""
  @Field val title: String = ""
}

class SelectionStart : Record {
  @Field val x: Double = 0.0
  @Field val y: Double = 0.0
  @Field val token: Int = 0
}

private const val ACTION_GROUP = 0x6279

/**
 * A transparent, selectable copy of one laid-out paragraph. The visible React Native text stays
 * underneath and owns layout and accessibility; this layer only provides range selection, handles
 * and the floating action mode with the app's actions.
 */
@SuppressLint("ViewConstructor")
class BycodaSelectableTextView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true

  val onSelectionAction by EventDispatcher<Map<String, Any>>()
  val onSelectionChange by EventDispatcher<Map<String, Any>>()

  var text = ""
  var runs: List<SelectableRun> = emptyList()
  var fontSizeSp = 15f
  var lineHeightSp = 0f
  var fontWeight = "400"
  var textColorArgb: Int = Color.TRANSPARENT
  var selectionColorArgb: Int? = null
  var actions: List<SelectableAction> = emptyList()
  var start: SelectionStart? = null

  private var appliedToken: Int? = null
  private var reportedSelection = false
  private var appliedKey: Any? = null

  private val textView = object : TextView(context) {
    override fun onSelectionChanged(selStart: Int, selEnd: Int) {
      super.onSelectionChanged(selStart, selEnd)
      reportSelection(selStart != selEnd && selStart >= 0 && selEnd >= 0)
    }
  }

  init {
    textView.setTextIsSelectable(true)
    textView.includeFontPadding = false
    textView.setPadding(0, 0, 0, 0)
    textView.setBackgroundColor(Color.TRANSPARENT)
    // React Native Text: high-quality breaks and no automatic hyphenation.
    textView.breakStrategy = Layout.BREAK_STRATEGY_HIGH_QUALITY
    textView.hyphenationFrequency = Layout.HYPHENATION_FREQUENCY_NONE
    // The React Native text underneath is the accessible element; this copy would be read twice.
    textView.importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
    textView.customSelectionActionModeCallback = object : ActionMode.Callback {
      override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
        actions.forEachIndexed { index, action ->
          menu.add(ACTION_GROUP, index + 1, index, action.title)
            .setShowAsAction(MenuItem.SHOW_AS_ACTION_IF_ROOM)
        }
        // Copy is the app's own action so it can confirm the result; Share, Select all and the
        // system's text-classifier items stay.
        menu.removeItem(android.R.id.copy)
        return true
      }

      override fun onPrepareActionMode(mode: ActionMode, menu: Menu): Boolean {
        menu.removeItem(android.R.id.copy)
        return true
      }

      override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean {
        if (item.groupId != ACTION_GROUP) return false
        val action = actions.getOrNull(item.itemId - 1) ?: return false
        perform(action.id)
        mode.finish()
        return true
      }

      override fun onDestroyActionMode(mode: ActionMode) = Unit
    }
    addView(textView, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.MATCH_PARENT))
  }

  fun applyProps() {
    textView.setTextColor(textColorArgb)
    selectionColorArgb?.let { textView.highlightColor = (it and 0x00FFFFFF) or (0x55 shl 24) }
    val key = listOf(text, runs.map { listOf(it.start, it.end, it.weight, it.italic, it.mono, it.strike, it.size) }, fontSizeSp, lineHeightSp, fontWeight)
    if (key != appliedKey) {
      appliedKey = key
      textView.setTextSize(TypedValue.COMPLEX_UNIT_SP, fontSizeSp)
      textView.typeface = typeface(fontWeight, italic = false, mono = false)
      textView.setText(spanned(), TextView.BufferType.SPANNABLE)
    }
    post { applyStartIfNeeded() }
  }

  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    super.onLayout(changed, l, t, r, b)
    if (changed) post { applyStartIfNeeded() }
  }

  override fun onDetachedFromWindow() {
    textView.clearFocus()
    super.onDetachedFromWindow()
  }

  // Text

  private fun sp(value: Float) = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, value, resources.displayMetrics)

  private fun spanned(): CharSequence {
    val result = SpannableString(text)
    val length = result.length
    for (run in runs) {
      val lower = run.start.coerceIn(0, length)
      val upper = run.end.coerceIn(lower, length)
      if (upper <= lower) continue
      val size = run.size?.let { sp(it.toFloat()) }
      result.setSpan(FontSpan(typeface(run.weight ?: fontWeight, run.italic, run.mono), size), lower, upper, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
      if (run.strike) result.setSpan(StrikethroughSpan(), lower, upper, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE)
    }
    if (lineHeightSp > 0 && length > 0) {
      result.setSpan(FixedLineHeight(sp(lineHeightSp).toInt()), 0, length, Spanned.SPAN_INCLUSIVE_INCLUSIVE)
    }
    return result
  }

  private fun typeface(weight: String, italic: Boolean, mono: Boolean): Typeface {
    val base = if (mono) Typeface.MONOSPACE else Typeface.DEFAULT
    val numeric = when (weight) {
      "bold" -> 700
      "normal" -> 400
      else -> weight.toIntOrNull() ?: 400
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) return Typeface.create(base, numeric, italic)
    val style = when {
      numeric >= 600 && italic -> Typeface.BOLD_ITALIC
      numeric >= 600 -> Typeface.BOLD
      italic -> Typeface.ITALIC
      else -> Typeface.NORMAL
    }
    return Typeface.create(base, style)
  }

  // Selection

  private fun reportSelection(has: Boolean) {
    if (has == reportedSelection) return
    reportedSelection = has
    onSelectionChange(mapOf("hasSelection" to has))
  }

  private fun perform(id: String) {
    val from = minOf(textView.selectionStart, textView.selectionEnd)
    val to = maxOf(textView.selectionStart, textView.selectionEnd)
    val source = textView.text ?: return
    if (from < 0 || to <= from || to > source.length) return
    onSelectionAction(mapOf("action" to id, "text" to source.subSequence(from, to).toString(), "start" to from, "end" to to))
  }

  /**
   * Starts the platform's own long-press selection at the point React Native received, so the
   * word, both handles and the floating toolbar appear exactly as for a direct long-press. The
   * events go only to this text view; the person's real touch stays with React Native.
   */
  private fun applyStartIfNeeded() {
    val start = start ?: return
    if (start.token == appliedToken || !isAttachedToWindow || width == 0 || textView.length() == 0) return
    appliedToken = start.token
    val density = resources.displayMetrics.density
    val x = (start.x * density).toFloat()
    val y = (start.y * density).toFloat()
    textView.requestFocus()
    val downTime = SystemClock.uptimeMillis()
    dispatch(downTime, downTime, MotionEvent.ACTION_DOWN, x, y)
    val wait = ViewConfiguration.getTapTimeout() + ViewConfiguration.getLongPressTimeout() + 120L
    textView.postDelayed({
      if (!textView.isAttachedToWindow) return@postDelayed
      dispatch(downTime, SystemClock.uptimeMillis(), MotionEvent.ACTION_UP, x, y)
      if (!textView.hasSelection()) {
        reportedSelection = false
        onSelectionChange(mapOf("hasSelection" to false))
      }
    }, wait)
  }

  private fun dispatch(downTime: Long, eventTime: Long, action: Int, x: Float, y: Float) {
    val event = MotionEvent.obtain(downTime, eventTime, action, x, y, 0)
    event.source = InputDevice.SOURCE_TOUCHSCREEN
    textView.dispatchTouchEvent(event)
    event.recycle()
  }
}

/** Font face and optional size for one run (inline code is smaller and monospace). */
private class FontSpan(private val face: Typeface, private val sizePx: Float?) : MetricAffectingSpan() {
  override fun updateDrawState(paint: TextPaint) = apply(paint)
  override fun updateMeasureState(paint: TextPaint) = apply(paint)
  private fun apply(paint: TextPaint) {
    paint.typeface = face
    sizePx?.let { paint.textSize = it }
  }
}

/** React Native's CustomLineHeightSpan: every line box is exactly the line height, glyphs centered. */
private class FixedLineHeight(private val height: Int) : LineHeightSpan {
  override fun chooseHeight(text: CharSequence, start: Int, end: Int, spanstartv: Int, lineHeight: Int, fm: Paint.FontMetricsInt) {
    val leading = height - (-fm.ascent + fm.descent)
    fm.ascent -= ceil(leading / 2.0f).toInt()
    fm.descent += floor(leading / 2.0f).toInt()
    fm.top = fm.ascent
    fm.bottom = fm.descent
  }
}
