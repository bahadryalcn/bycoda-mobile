import { useImperativeHandle, useMemo, useRef, useState, type ComponentType, type Ref } from "react";
import {
  Keyboard,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputInstance,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import Bold from "lucide-react-native/icons/bold";
import Code from "lucide-react-native/icons/code";
import Heading from "lucide-react-native/icons/heading";
import Italic from "lucide-react-native/icons/italic";
import KeyboardOff from "lucide-react-native/icons/keyboard-off";
import Link from "lucide-react-native/icons/link";
import List from "lucide-react-native/icons/list";
import ListChecks from "lucide-react-native/icons/list-checks";
import ListOrdered from "lucide-react-native/icons/list-ordered";
import Minus from "lucide-react-native/icons/minus";
import Strikethrough from "lucide-react-native/icons/strikethrough";
import TextQuote from "lucide-react-native/icons/text-quote";
import { IconButton } from "./buttons";
import { useCopy } from "./copy";
import { useMobileTheme } from "./theme";
import { fontSize, iconSize, lineHeight, metrics, monoFont, radii, space, type MobileColors } from "./tokens";
import {
  MARKDOWN_STYLE_LIMIT,
  continueMarkdownList,
  markdownEdit,
  markdownSpans,
  type MarkdownCommand,
  type MarkdownTone,
} from "./markdown-editing";

type Selection = { start: number; end: number };

/** What a parent toolbar needs from the body editor. */
export type MarkdownEditorHandle = {
  apply: (command: MarkdownCommand) => void;
  focus: () => void;
  blur: () => void;
};

// Colors come from useMobileTheme() at render so a theme switch restyles a mounted editor.
const titleStyle: TextStyle = {
  fontSize: fontSize.hero,
  lineHeight: lineHeight.hero,
  fontWeight: "700",
  margin: 0,
  paddingHorizontal: 0,
  textAlignVertical: "top",
  minHeight: metrics.touchTarget,
  paddingVertical: (metrics.touchTarget - lineHeight.hero) / 2,
};
// Writing reads at the input size with the chat reading leading, not the compact form leading.
const bodyStyle: TextStyle = {
  fontSize: fontSize.input,
  lineHeight: lineHeight.message,
  padding: 0,
  margin: 0,
  textAlignVertical: "top",
};
const barStyle: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  minHeight: metrics.touchTarget,
  borderTopWidth: StyleSheet.hairlineWidth,
};
const dividerStyle: ViewStyle = { width: StyleSheet.hairlineWidth, alignSelf: "stretch", marginVertical: space.md };

function toneStyles(palette: MobileColors): Record<MarkdownTone, TextStyle> {
  return {
    marker: { color: palette.tertiary },
    h1: { fontSize: fontSize.hero, lineHeight: lineHeight.hero, fontWeight: "700" },
    h2: { fontSize: fontSize.heading, lineHeight: lineHeight.heading, fontWeight: "700" },
    h3: { fontSize: fontSize.title, lineHeight: lineHeight.message, fontWeight: "700" },
    strong: { fontWeight: "700" },
    em: { fontStyle: "italic" },
    strike: { textDecorationLine: "line-through" },
    code: { fontFamily: monoFont, color: palette.accent, backgroundColor: palette.fill, borderRadius: radii.badge },
    fence: { fontFamily: monoFont, fontSize: fontSize.small, color: palette.muted },
    link: { color: palette.accent, textDecorationLine: "underline" },
    quote: { color: palette.muted, fontStyle: "italic" },
    done: { color: palette.muted, textDecorationLine: "line-through" },
    rule: { color: palette.tertiary },
  };
}

/** A document title: large, borderless and wrapping. Return moves on instead of adding a line. */
export function DocumentTitleInput({
  ref,
  value,
  onChangeText,
  label,
  placeholder,
  editable = true,
  autoFocus,
  error,
  onSubmit,
  onFocus,
  onBlur,
  style,
}: {
  ref?: Ref<TextInputInstance>;
  value: string;
  onChangeText: (value: string) => void;
  label: string;
  placeholder?: string;
  editable?: boolean;
  autoFocus?: boolean;
  error?: string;
  onSubmit?: () => void;
  onFocus?: () => void;
  onBlur?: () => void;
  style?: StyleProp<TextStyle>;
}) {
  const { colors: palette, mode } = useMobileTheme();
  return (
    <TextInput
      ref={ref}
      value={value}
      // A title is one line of meaning even when it wraps; pasted breaks become spaces.
      onChangeText={(next) => onChangeText(next.replace(/\r?\n/g, " "))}
      accessibilityLabel={label}
      aria-invalid={!!error || undefined}
      placeholder={placeholder}
      placeholderTextColor={palette.muted}
      selectionColor={palette.accent}
      cursorColor={palette.accent}
      keyboardAppearance={mode === "dark" ? "dark" : "light"}
      editable={editable}
      autoFocus={autoFocus}
      multiline
      scrollEnabled
      submitBehavior="submit"
      returnKeyType="next"
      autoCapitalize="sentences"
      onSubmitEditing={onSubmit}
      onFocus={onFocus}
      onBlur={onBlur}
      style={[titleStyle, { color: error ? palette.danger : palette.text }, style]}
    />
  );
}

/**
 * A borderless markdown field whose source is styled as it is typed: headings
 * grow, emphasis, code, links, quotes and checked items render in place, and
 * the syntax recedes. The field is its own scroller so the caret always stays
 * visible above the keyboard.
 */
export function MarkdownTextEditor({
  ref,
  value,
  onChangeText,
  label,
  placeholder,
  editable = true,
  continueLists = true,
  onFocus,
  onBlur,
  style,
}: {
  ref?: Ref<MarkdownEditorHandle>;
  value: string;
  onChangeText: (value: string) => void;
  label: string;
  placeholder?: string;
  editable?: boolean;
  continueLists?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  style?: StyleProp<TextStyle>;
}) {
  const { colors: palette, mode } = useMobileTheme();
  const input = useRef<TextInputInstance>(null);
  const latest = useRef(value);
  latest.current = value;
  const selection = useRef<Selection>({ start: value.length, end: value.length });
  // A selection the field must show once after an edit made here, cleared when it arrives.
  const [pending, setPending] = useState<Selection>();
  const place = (next: Selection) => {
    selection.current = next;
    setPending(next);
  };
  const change = (next: string) => {
    const continued = continueLists ? continueMarkdownList(latest.current, next) : null;
    if (continued) {
      latest.current = continued.text;
      onChangeText(continued.text);
      place({ start: continued.caret, end: continued.caret });
      return;
    }
    if (pending) setPending(undefined);
    latest.current = next;
    onChangeText(next);
  };
  useImperativeHandle(ref, () => ({
    apply(command) {
      if (!editable) return;
      const { start, end } = selection.current;
      const edit = markdownEdit(command, latest.current, start, end);
      const next = latest.current.slice(0, edit.from) + edit.insert + latest.current.slice(edit.to);
      latest.current = next;
      onChangeText(next);
      place({ start: Math.min(edit.anchor, edit.head), end: Math.max(edit.anchor, edit.head) });
      input.current?.focus();
    },
    focus: () => input.current?.focus(),
    blur: () => input.current?.blur(),
  }));
  // React Native Web renders a plain textarea that cannot hold styled runs.
  const styled = process.env.EXPO_OS !== "web" && !!value && value.length <= MARKDOWN_STYLE_LIMIT;
  const spans = useMemo(() => (styled ? markdownSpans(value) : null), [styled, value]);
  const tones = useMemo(() => toneStyles(palette), [palette]);
  return (
    <TextInput
      ref={input}
      value={spans ? undefined : value}
      onChangeText={change}
      selection={pending}
      onSelectionChange={({ nativeEvent }) => {
        selection.current = nativeEvent.selection;
        if (pending && nativeEvent.selection.start === pending.start && nativeEvent.selection.end === pending.end)
          setPending(undefined);
      }}
      accessibilityLabel={label}
      placeholder={placeholder}
      placeholderTextColor={palette.muted}
      selectionColor={palette.accent}
      cursorColor={palette.accent}
      keyboardAppearance={mode === "dark" ? "dark" : "light"}
      editable={editable}
      multiline
      scrollEnabled
      autoCapitalize="sentences"
      onFocus={onFocus}
      onBlur={onBlur}
      style={[bodyStyle, { color: palette.text }, style]}
    >
      {spans?.map((span, index) => (
        <Text key={index} style={span.tones.length ? span.tones.map((tone) => tones[tone]) : undefined}>
          {span.text}
        </Text>
      ))}
    </TextInput>
  );
}

type FormatAction = {
  command: MarkdownCommand;
  icon: ComponentType<{ size?: number; strokeWidth?: number; color?: string }>;
  label: [tr: string, en: string];
};

// Grouped as the desktop toolbar is: block shape, inline style, then inserts.
const FORMAT_GROUPS: readonly (readonly FormatAction[])[] = [
  [
    { command: "heading", icon: Heading, label: ["Ara başlık", "Heading"] },
    { command: "checklist", icon: ListChecks, label: ["Yapılacaklar listesi", "Checklist"] },
    { command: "bullet", icon: List, label: ["Madde işaretli liste", "Bulleted list"] },
    { command: "numbered", icon: ListOrdered, label: ["Numaralı liste", "Numbered list"] },
  ],
  [
    { command: "bold", icon: Bold, label: ["Kalın", "Bold"] },
    { command: "italic", icon: Italic, label: ["İtalik", "Italic"] },
    { command: "strike", icon: Strikethrough, label: ["Üstü çizili", "Strikethrough"] },
    { command: "code", icon: Code, label: ["Kod", "Code"] },
  ],
  [
    { command: "link", icon: Link, label: ["Bağlantı ekle", "Insert link"] },
    { command: "quote", icon: TextQuote, label: ["Alıntı bloğu", "Quote block"] },
    { command: "rule", icon: Minus, label: ["Ayırıcı çizgi", "Divider"] },
  ],
];

/**
 * The formatting row that sits on the keyboard while the body is edited.
 * Taps keep the keyboard and the caret; the last control puts the keyboard away.
 */
export function MarkdownFormatBar({
  onApply,
  disabled,
  style,
}: {
  onApply: (command: MarkdownCommand) => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors: palette } = useMobileTheme();
  const copy = useCopy();
  return (
    <View
      accessibilityRole="toolbar"
      accessibilityLabel={copy("Biçimlendirme", "Formatting")}
      style={[barStyle, { borderTopColor: palette.border, backgroundColor: palette.panel }, style]}
    >
      <ScrollView
        horizontal
        keyboardShouldPersistTaps="always"
        showsHorizontalScrollIndicator={false}
        style={{ flex: 1 }}
        contentContainerStyle={{ alignItems: "center", paddingHorizontal: space.xs }}
      >
        {FORMAT_GROUPS.map((group, index) => (
          <View key={index} style={{ flexDirection: "row", alignItems: "center" }}>
            {index > 0 ? <View style={[dividerStyle, { backgroundColor: palette.border }]} /> : null}
            {group.map((action) => {
              const Icon = action.icon;
              return (
                <IconButton
                  key={action.command}
                  label={copy(...action.label)}
                  disabled={disabled}
                  reserveTouchTarget
                  onPress={() => onApply(action.command)}
                >
                  <Icon size={iconSize.action} strokeWidth={1.8} color={palette.text} />
                </IconButton>
              );
            })}
          </View>
        ))}
      </ScrollView>
      <View style={[dividerStyle, { backgroundColor: palette.border }]} />
      <IconButton label={copy("Klavyeyi gizle", "Hide keyboard")} reserveTouchTarget onPress={() => Keyboard.dismiss()}>
        <KeyboardOff size={iconSize.action} strokeWidth={1.8} color={palette.muted} />
      </IconButton>
    </View>
  );
}
