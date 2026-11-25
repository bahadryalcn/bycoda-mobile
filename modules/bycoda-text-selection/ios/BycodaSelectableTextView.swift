import ExpoModulesCore
import UIKit

struct SelectableRun: Record {
  @Field var start: Int = 0
  @Field var end: Int = 0
  @Field var weight: String? = nil
  @Field var italic: Bool = false
  @Field var mono: Bool = false
  @Field var strike: Bool = false
  @Field var size: Double? = nil
}

struct SelectableAction: Record {
  @Field var id: String = ""
  @Field var title: String = ""
}

struct SelectionStart: Record {
  @Field var x: Double = 0
  @Field var y: Double = 0
  @Field var token: Int = 0
}

/**
 A transparent, selectable copy of one laid-out paragraph. The visible React Native text stays
 underneath and owns layout and accessibility; this layer only provides range selection, handles
 and the edit menu with the app's actions.
 */
final class BycodaSelectableTextView: ExpoView, UITextViewDelegate, UIEditMenuInteractionDelegate {
  let onSelectionAction = EventDispatcher()
  let onSelectionChange = EventDispatcher()

  var text = ""
  var runs: [SelectableRun] = []
  var fontSize: CGFloat = 15
  var lineHeight: CGFloat = 0
  var fontScale: CGFloat = 1
  var fontWeight = "400"
  var textColor: UIColor = .clear
  var selectionColor: UIColor?
  var actions: [SelectableAction] = []
  var start: SelectionStart?

  private let textView = UITextView(frame: .zero, textContainer: nil)
  private var menuInteraction: UIEditMenuInteraction?
  private var appliedToken: Int?
  private var reportedSelection = false

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    textView.isEditable = false
    textView.isSelectable = true
    textView.isScrollEnabled = false
    textView.backgroundColor = .clear
    textView.textContainerInset = .zero
    textView.textContainer.lineFragmentPadding = 0
    textView.dataDetectorTypes = []
    textView.adjustsFontForContentSizeCategory = false
    textView.delegate = self
    // The React Native text underneath is the accessible element; this copy would be read twice.
    textView.isAccessibilityElement = false
    textView.accessibilityElementsHidden = true
    // Our own interaction lets a long-press that started in React Native open the menu programmatically.
    let interaction = UIEditMenuInteraction(delegate: self)
    textView.addInteraction(interaction)
    menuInteraction = interaction
    addSubview(textView)
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    if textView.frame != bounds {
      textView.frame = bounds
    }
    applyStartIfNeeded()
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      if textView.isFirstResponder {
        textView.resignFirstResponder()
      }
    } else {
      applyStartIfNeeded()
    }
  }

  func applyProps() {
    textView.tintColor = selectionColor
    let next = attributedText()
    if !textView.attributedText.isEqual(to: next) {
      textView.attributedText = next
    }
    applyStartIfNeeded()
  }

  // MARK: - Text

  /// Mirrors React Native's iOS text attributes: fixed line height and the baseline offset that
  /// centers glyphs in the line box (RCTApplyBaselineOffset), so wrapping and line rects match.
  private func attributedText() -> NSAttributedString {
    let size = fontSize * fontScale
    let line = lineHeight * fontScale
    let paragraph = NSMutableParagraphStyle()
    if line > 0 {
      paragraph.minimumLineHeight = line
      paragraph.maximumLineHeight = line
    }
    let result = NSMutableAttributedString(string: text, attributes: [
      .font: Self.font(size: size, weight: fontWeight, italic: false, mono: false),
      .foregroundColor: textColor,
      .paragraphStyle: paragraph,
    ])
    let length = result.length
    for run in runs {
      let lower = max(0, min(run.start, length))
      let upper = max(lower, min(run.end, length))
      guard upper > lower else { continue }
      let range = NSRange(location: lower, length: upper - lower)
      let runSize = run.size.map { CGFloat($0) * fontScale } ?? size
      result.addAttribute(
        .font,
        value: Self.font(size: runSize, weight: run.weight ?? fontWeight, italic: run.italic, mono: run.mono),
        range: range
      )
      if run.strike {
        result.addAttribute(.strikethroughStyle, value: NSUnderlineStyle.single.rawValue, range: range)
      }
    }
    if line > 0 && length > 0 {
      var tallest: CGFloat = 0
      result.enumerateAttribute(.font, in: NSRange(location: 0, length: length)) { value, _, _ in
        if let font = value as? UIFont {
          tallest = max(tallest, font.lineHeight)
        }
      }
      if line >= tallest {
        result.addAttribute(.baselineOffset, value: (line - tallest) / 2, range: NSRange(location: 0, length: length))
      }
    }
    return result
  }

  private static func weight(_ value: String) -> UIFont.Weight {
    switch value {
    case "100": return .ultraLight
    case "200": return .thin
    case "300": return .light
    case "500": return .medium
    case "600": return .semibold
    case "bold", "700": return .bold
    case "800": return .heavy
    case "900": return .black
    default: return .regular
    }
  }

  private static func font(size: CGFloat, weight: String, italic: Bool, mono: Bool) -> UIFont {
    let resolved = Self.weight(weight)
    var font: UIFont
    if mono {
      // React Native resolves the "Menlo" family to its nearest face: Regular below 600, Bold from 600.
      let face = resolved.rawValue >= UIFont.Weight.semibold.rawValue ? "Menlo-Bold" : "Menlo-Regular"
      font = UIFont(name: face, size: size) ?? .monospacedSystemFont(ofSize: size, weight: resolved)
    } else {
      font = .systemFont(ofSize: size, weight: resolved)
    }
    if italic,
      let descriptor = font.fontDescriptor.withSymbolicTraits(font.fontDescriptor.symbolicTraits.union(.traitItalic))
    {
      font = UIFont(descriptor: descriptor, size: size)
    }
    return font
  }

  // MARK: - Selection

  func textViewDidChangeSelection(_ textView: UITextView) {
    let has = textView.selectedRange.length > 0
    guard has != reportedSelection else { return }
    reportedSelection = has
    onSelectionChange(["hasSelection": has])
  }

  private func reportNoSelection() {
    reportedSelection = false
    onSelectionChange(["hasSelection": false])
  }

  /// Selects the word under the long-press that React Native received, then opens the menu.
  private func applyStartIfNeeded() {
    guard let start, start.token != appliedToken, window != nil, bounds.width > 0,
      textView.attributedText.length > 0
    else { return }
    appliedToken = start.token
    let point = CGPoint(x: start.x, y: start.y)
    if !textView.isFirstResponder {
      _ = textView.becomeFirstResponder()
    }
    // Props can arrive before layoutSubviews sized the text view; hit-test at the final width.
    if textView.frame != bounds {
      textView.frame = bounds
    }
    textView.layoutIfNeeded()
    guard let position = textView.closestPosition(to: point) else {
      NSLog("[BycodaTextSelection] no text position at %@ in %@", NSCoder.string(for: point), NSCoder.string(for: bounds))
      reportNoSelection()
      return
    }
    let offset = textView.offset(from: textView.beginningOfDocument, to: position)
    guard let word = Self.wordRange(in: textView.attributedText.string as NSString, near: offset) else {
      NSLog("[BycodaTextSelection] no word near offset %d", offset)
      reportNoSelection()
      return
    }
    textView.selectedRange = word
    DispatchQueue.main.async { [weak self] in
      guard let self, self.textView.selectedRange.length > 0 else { return }
      self.menuInteraction?.presentEditMenu(with: UIEditMenuConfiguration(identifier: nil, sourcePoint: point))
    }
  }

  /// The word containing `offset`, else the nearest word on that line of text; the tokenizer
  /// returns nil at word boundaries, which made a press between words select nothing.
  static func wordRange(in text: NSString, near offset: Int) -> NSRange? {
    let length = text.length
    guard length > 0 else { return nil }
    let at = max(0, min(offset, length - 1))
    var best: NSRange?
    var bestDistance = Int.max
    text.enumerateSubstrings(in: NSRange(location: 0, length: length), options: [.byWords, .substringNotRequired]) { _, range, _, stop in
      let distance = at < range.location ? range.location - at : at >= NSMaxRange(range) ? at - NSMaxRange(range) + 1 : 0
      if distance < bestDistance {
        bestDistance = distance
        best = range
      }
      if distance == 0 || range.location > at { stop.pointee = true }
    }
    return best
  }

  // MARK: - Menu

  /// Menu for selections the person makes directly in the text view.
  func textView(_ textView: UITextView, editMenuForTextIn range: NSRange, suggestedActions: [UIMenuElement]) -> UIMenu? {
    return menu(suggested: suggestedActions)
  }

  /// Menu for the programmatic presentation after a React Native long-press.
  func editMenuInteraction(
    _ interaction: UIEditMenuInteraction,
    menuFor configuration: UIEditMenuConfiguration,
    suggestedActions: [UIMenuElement]
  ) -> UIMenu? {
    return menu(suggested: suggestedActions)
  }

  func editMenuInteraction(_ interaction: UIEditMenuInteraction, targetRectFor configuration: UIEditMenuConfiguration) -> CGRect {
    guard let range = textView.selectedTextRange else { return .null }
    return textView.selectionRects(for: range).reduce(CGRect.null) { $0.union($1.rect) }
  }

  /// App actions first; the system's own items (Look Up, Translate, Share…) stay, except Copy,
  /// which the app provides so it can confirm the result.
  private func menu(suggested: [UIMenuElement]) -> UIMenu {
    let custom: [UIMenuElement] = actions.map { action in
      UIAction(title: action.title) { [weak self] _ in
        self?.perform(action.id)
      }
    }
    let app = UIMenu(title: "", options: .displayInline, children: custom)
    return UIMenu(children: [app] + Self.withoutCopy(suggested))
  }

  private static func withoutCopy(_ elements: [UIMenuElement]) -> [UIMenuElement] {
    return elements.compactMap { element in
      if let command = element as? UICommand, command.action == #selector(UIResponderStandardEditActions.copy(_:)) {
        return nil
      }
      if let menu = element as? UIMenu {
        let children = withoutCopy(menu.children)
        return children.isEmpty ? nil : menu.replacingChildren(children)
      }
      return element
    }
  }

  private func perform(_ id: String) {
    let range = textView.selectedRange
    let source = textView.attributedText.string as NSString
    guard range.location != NSNotFound, range.length > 0, NSMaxRange(range) <= source.length else { return }
    onSelectionAction([
      "action": id,
      "text": source.substring(with: range),
      "start": range.location,
      "end": NSMaxRange(range),
    ])
  }
}
