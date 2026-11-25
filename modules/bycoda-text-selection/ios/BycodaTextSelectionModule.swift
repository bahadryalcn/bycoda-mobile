import ExpoModulesCore
import UIKit

public class BycodaTextSelectionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BycodaTextSelection")

    View(BycodaSelectableTextView.self) {
      Events("onSelectionAction", "onSelectionChange")

      Prop("text") { (view: BycodaSelectableTextView, value: String) in
        view.text = value
      }
      Prop("runs") { (view: BycodaSelectableTextView, value: [SelectableRun]) in
        view.runs = value
      }
      Prop("fontSize") { (view: BycodaSelectableTextView, value: Double) in
        view.fontSize = CGFloat(value)
      }
      Prop("lineHeight") { (view: BycodaSelectableTextView, value: Double) in
        view.lineHeight = CGFloat(value)
      }
      Prop("fontScale") { (view: BycodaSelectableTextView, value: Double) in
        view.fontScale = value > 0 ? CGFloat(value) : 1
      }
      Prop("fontWeight") { (view: BycodaSelectableTextView, value: String) in
        view.fontWeight = value
      }
      Prop("textColor") { (view: BycodaSelectableTextView, value: UIColor?) in
        view.textColor = value ?? .clear
      }
      Prop("selectionColor") { (view: BycodaSelectableTextView, value: UIColor?) in
        view.selectionColor = value
      }
      Prop("actions") { (view: BycodaSelectableTextView, value: [SelectableAction]) in
        view.actions = value
      }
      Prop("start") { (view: BycodaSelectableTextView, value: SelectionStart?) in
        view.start = value
      }

      OnViewDidUpdateProps { (view: BycodaSelectableTextView) in
        view.applyProps()
      }
    }
  }
}
