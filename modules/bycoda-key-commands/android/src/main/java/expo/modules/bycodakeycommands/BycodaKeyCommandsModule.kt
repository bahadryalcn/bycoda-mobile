package expo.modules.bycodakeycommands

import android.app.Activity
import android.view.KeyCharacterMap
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.inputmethod.BaseInputConnection
import android.view.inputmethod.InputMethodManager
import android.webkit.WebView
import android.widget.EditText
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.descendants
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.lang.ref.WeakReference

internal object KeyCommands {
  var commands: List<Map<String, Any?>> = emptyList()
  var module = WeakReference<BycodaKeyCommandsModule>(null)
  fun dispatch(event: KeyEvent, activity: Activity): Boolean {
    if (event.deviceId == KeyCharacterMap.VIRTUAL_KEYBOARD || event.device?.isVirtual != false) return false
    val editor = activity.currentFocus as? EditText
    if (editor != null && BaseInputConnection.getComposingSpanStart(editor.text) >= 0) return false
    val key = when (event.keyCode) {
      KeyEvent.KEYCODE_ENTER, KeyEvent.KEYCODE_NUMPAD_ENTER -> "Enter"
      KeyEvent.KEYCODE_ESCAPE -> "Escape"
      KeyEvent.KEYCODE_DPAD_UP -> "ArrowUp"
      KeyEvent.KEYCODE_DPAD_DOWN -> "ArrowDown"
      KeyEvent.KEYCODE_TAB -> "Tab"
      KeyEvent.KEYCODE_LEFT_BRACKET -> "["
      else -> KeyEvent.keyCodeToString(event.keyCode).removePrefix("KEYCODE_").lowercase()
    }
    val command = commands.firstOrNull {
      (it["key"] as? String)?.equals(key, ignoreCase = true) == true &&
        (it["primary"] == true) == (event.isCtrlPressed || event.isMetaPressed) &&
        (it["shift"] == true) == event.isShiftPressed && !event.isAltPressed
    } ?: return false
    if (command["textInput"] == true) {
      if (editor == null || !editor.isShown) return false
      var ancestor: View? = editor
      while (ancestor != null) {
        if (ancestor.importantForAccessibility == View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS) return false
        ancestor = ancestor.parent as? View
      }
    }
    val target = module.get() ?: return false
    if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) target.emit(command["id"] as String)
    return event.action == KeyEvent.ACTION_DOWN || event.action == KeyEvent.ACTION_UP
  }
}

class BycodaKeyCommandsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BycodaKeyCommands")
    Events("onKeyCommand")
    OnCreate { KeyCommands.module = WeakReference(this@BycodaKeyCommandsModule) }
    OnDestroy {
      if (KeyCommands.module.get() === this@BycodaKeyCommandsModule) {
        KeyCommands.module.clear()
        KeyCommands.commands = emptyList()
      }
    }
    AsyncFunction("setCommands") { commands: List<Map<String, Any?>> -> KeyCommands.commands = commands }
      .runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)
    AsyncFunction("showTerminalKeyboard") { terminalViewTag: Int -> showTerminalKeyboard(terminalViewTag) }
      .runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)
    AsyncFunction("hideTerminalKeyboard") { terminalViewTag: Int -> hideTerminalKeyboard(terminalViewTag) }
      .runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)
  }
  private fun terminalWebView(activity: Activity, terminalViewTag: Int): WebView? {
    val terminal = activity.findViewById<ViewGroup>(terminalViewTag) ?: return null
    val webView = terminal.descendants.filterIsInstance<WebView>().singleOrNull() ?: return null
    if (!webView.isAttachedToWindow || !webView.isShown || !webView.hasWindowFocus()) return null
    var ancestor: View? = webView
    while (ancestor != null) {
      if (ancestor.importantForAccessibility == View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS) return null
      ancestor = ancestor.parent as? View
    }
    return webView
  }
  private fun showTerminalKeyboard(terminalViewTag: Int): Boolean {
    val activity = appContext.currentActivity ?: return false
    val webView = terminalWebView(activity, terminalViewTag) ?: return false
    if (!webView.requestFocus()) return false
    val inputMethod = activity.getSystemService(InputMethodManager::class.java) ?: return false
    return webView.post {
      if (webView.hasFocus() && terminalWebView(activity, terminalViewTag) === webView) {
        inputMethod.showSoftInput(webView, 0)
      }
    }
  }
  private fun hideTerminalKeyboard(terminalViewTag: Int): Boolean {
    val activity = appContext.currentActivity ?: return false
    val webView = terminalWebView(activity, terminalViewTag) ?: return false
    if (!webView.hasFocus()) return false
    WindowInsetsControllerCompat(activity.window, webView).hide(WindowInsetsCompat.Type.ime())
    return true
  }
  fun emit(id: String) { sendEvent("onKeyCommand", mapOf("id" to id)) }
}

