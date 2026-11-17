package expo.modules.bycodasystemcolors

import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Locale

class BycodaSystemColorsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BycodaSystemColors")
    Function("getSwatches") { dark: Boolean ->
      val context = appContext.reactContext
      if (Build.VERSION.SDK_INT < 31 || context == null) null
      else {
        fun hex(resource: Int) = String.format(Locale.ROOT, "#%06X", context.getColor(resource) and 0xFFFFFF)
        mapOf(
          "primary" to hex(if (dark) android.R.color.system_accent1_200 else android.R.color.system_accent1_600),
          "onPrimary" to hex(if (dark) android.R.color.system_accent1_800 else android.R.color.system_accent1_0),
          "primaryContainer" to hex(if (dark) android.R.color.system_accent1_700 else android.R.color.system_accent1_100),
          "onPrimaryContainer" to hex(if (dark) android.R.color.system_accent1_100 else android.R.color.system_accent1_900),
          "surface" to hex(if (dark) android.R.color.system_neutral1_900 else android.R.color.system_neutral1_10),
          "surfaceVariant" to hex(if (dark) android.R.color.system_neutral2_800 else android.R.color.system_neutral2_100),
          "onSurface" to hex(if (dark) android.R.color.system_neutral1_100 else android.R.color.system_neutral1_900),
          "onSurfaceVariant" to hex(if (dark) android.R.color.system_neutral2_200 else android.R.color.system_neutral2_700),
        )
      }
    }
  }
}
