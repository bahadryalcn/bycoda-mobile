package expo.modules.bycodakeycommands

import android.app.Activity
import android.content.Context
import android.view.KeyEvent
import android.view.Window
import expo.modules.core.interfaces.Package
import expo.modules.core.interfaces.ReactActivityLifecycleListener

/** Lifecycle installs interception before ReactActivity/EditText consumes Enter. */
class BycodaKeyCommandsPackage : Package {
  override fun createReactActivityLifecycleListeners(activityContext: Context) = listOf(object : ReactActivityLifecycleListener {
    private var original: Window.Callback? = null
    private var installed: Window.Callback? = null
    override fun onResume(activity: Activity) {
      if (installed != null) return
      val previous = activity.window.callback ?: return
      original = previous
      val wrapper = object : Window.Callback by previous {
        override fun dispatchKeyEvent(event: KeyEvent): Boolean =
          KeyCommands.dispatch(event, activity) || previous.dispatchKeyEvent(event)
        override fun dispatchKeyShortcutEvent(event: KeyEvent): Boolean =
          KeyCommands.dispatch(event, activity) || previous.dispatchKeyShortcutEvent(event)
      }
      installed = wrapper
      activity.window.callback = wrapper
    }
    override fun onPause(activity: Activity) { restore(activity) }
    override fun onDestroy(activity: Activity) { restore(activity) }
    private fun restore(activity: Activity) {
      if (activity.window.callback === installed) activity.window.callback = original
      original = null
      installed = null
    }
  })
}
