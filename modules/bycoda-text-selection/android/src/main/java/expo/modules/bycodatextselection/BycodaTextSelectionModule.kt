package expo.modules.bycodatextselection

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BycodaTextSelectionModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("BycodaTextSelection")

    View(BycodaSelectableTextView::class) {
      Events("onSelectionAction", "onSelectionChange")

      Prop("text") { view: BycodaSelectableTextView, value: String ->
        view.text = value
      }
      Prop("runs") { view: BycodaSelectableTextView, value: List<SelectableRun> ->
        view.runs = value
      }
      Prop("fontSize") { view: BycodaSelectableTextView, value: Double ->
        view.fontSizeSp = value.toFloat()
      }
      Prop("lineHeight") { view: BycodaSelectableTextView, value: Double ->
        view.lineHeightSp = value.toFloat()
      }
      // Android scales text with sp units like React Native does; the JS font scale is iOS-only.
      Prop("fontScale") { _: BycodaSelectableTextView, _: Double -> }
      Prop("fontWeight") { view: BycodaSelectableTextView, value: String ->
        view.fontWeight = value
      }
      Prop("textColor") { view: BycodaSelectableTextView, value: Int? ->
        view.textColorArgb = value ?: android.graphics.Color.TRANSPARENT
      }
      Prop("selectionColor") { view: BycodaSelectableTextView, value: Int? ->
        view.selectionColorArgb = value
      }
      Prop("actions") { view: BycodaSelectableTextView, value: List<SelectableAction> ->
        view.actions = value
      }
      Prop("start") { view: BycodaSelectableTextView, value: SelectionStart? ->
        view.start = value
      }

      OnViewDidUpdateProps { view: BycodaSelectableTextView ->
        view.applyProps()
      }
    }
  }
}
