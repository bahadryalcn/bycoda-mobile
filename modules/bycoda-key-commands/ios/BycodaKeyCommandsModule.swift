import ExpoModulesCore
import UIKit
import ObjectiveC.runtime

// Root stays in the responder chain while a text field owns first responder.
private final class CommandReceiver {
  static let shared = CommandReceiver()
  weak var module: BycodaKeyCommandsModule?
  weak var controller: UIViewController?
  var installed: [UIKeyCommand] = []
  var textCommands = Set<String>()
  let action = NSSelectorFromString("bycodaHardwareKeyCommand:")

  func replace(_ specs: [[String: Any]], module: BycodaKeyCommandsModule) {
    clear()
    self.module = module
    guard let root = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene })
      .flatMap({ $0.windows }).first(where: { $0.isKeyWindow })?.rootViewController else { return }
    controller = root
    // A private selector adds only our action; no UIKit method is swizzled.
    if class_getInstanceMethod(type(of: root), action) == nil {
      let handler: @convention(block) (UIViewController, UIKeyCommand) -> Void = { controller, command in
        if CommandReceiver.hasMarkedText(controller.view) { return }
        guard let id = command.propertyList as? String else { return }
        if CommandReceiver.shared.textCommands.contains(id) && !CommandReceiver.hasVisibleTextFocus(controller.view) { return }
        CommandReceiver.shared.module?.sendEvent("onKeyCommand", ["id": id])
      }
      class_addMethod(type(of: root), action, imp_implementationWithBlock(handler), "v@:@")
    }
    for spec in specs {
      guard let key = spec["key"] as? String, let id = spec["id"] as? String,
        let title = spec["title"] as? String else { continue }
      let input: String
      switch key {
      case "Enter": input = "\r"
      case "Escape": input = UIKeyCommand.inputEscape
      case "ArrowUp": input = UIKeyCommand.inputUpArrow
      case "ArrowDown": input = UIKeyCommand.inputDownArrow
      case "Tab": input = "\t"
      default: input = key.lowercased()
      }
      var flags: UIKeyModifierFlags = []
      if spec["primary"] as? Bool == true { flags.insert(.command) }
      if spec["shift"] as? Bool == true { flags.insert(.shift) }
      let command = UIKeyCommand(title: title, image: nil, action: action, input: input, modifierFlags: flags, propertyList: id)
      command.discoverabilityTitle = title
      command.wantsPriorityOverSystemBehavior = true
      root.addKeyCommand(command)
      installed.append(command)
      if spec["textInput"] as? Bool == true { textCommands.insert(id) }
    }
  }
  static func hasMarkedText(_ view: UIView) -> Bool {
    if view.isFirstResponder, let text = view as? UITextInput, text.markedTextRange != nil { return true }
    return view.subviews.contains(where: hasMarkedText)
  }
  static func hasVisibleTextFocus(_ view: UIView) -> Bool {
    if view.isFirstResponder && view is UITextInput {
      var ancestor: UIView? = view
      while let current = ancestor {
        if current.accessibilityElementsHidden || current.isHidden || current.alpha == 0 { return false }
        ancestor = current.superview
      }
      return true
    }
    return view.subviews.contains(where: hasVisibleTextFocus)
  }
  func clear() {
    for command in installed { controller?.removeKeyCommand(command) }
    installed = []
    textCommands = []
    controller = nil
  }
}

public final class BycodaKeyCommandsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("BycodaKeyCommands")
    Events("onKeyCommand")
    AsyncFunction("setCommands") { (specs: [[String: Any]]) in
      CommandReceiver.shared.replace(specs, module: self)
    }.runOnQueue(.main)
    OnDestroy {
      DispatchQueue.main.async {
        if CommandReceiver.shared.module === self { CommandReceiver.shared.clear() }
      }
    }
  }
}
