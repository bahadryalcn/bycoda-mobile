import { ScrollView, View } from "react-native";
import { ScrollFade } from "panelui-native/components/scroll-fade";
import ClipboardPaste from "lucide-react-native/icons/clipboard-paste";
import KeyboardIcon from "lucide-react-native/icons/keyboard";
import KeyboardOff from "lucide-react-native/icons/keyboard-off";
import { Button, IconButton } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { iconSize, radii, space } from "@/ui/tokens";
import type { TerminalBarKey, TerminalModifier, TerminalModifiers } from "./terminal-keys";

type Copy = ReturnType<typeof useCopy>;
type BarKey = { key: TerminalBarKey; label: string; accessibilityLabel: (copy: Copy) => string };
type BarModifier = { modifier: TerminalModifier; label: string; accessibilityLabel: (copy: Copy, armed: boolean) => string };

/** Key caps in bar order; labels are the key names a desktop keyboard prints, not translated. */
const LEADING_KEYS: BarKey[] = [
  { key: "up", label: "↑", accessibilityLabel: (copy) => copy("Yukarı ok", "Arrow up") },
  { key: "down", label: "↓", accessibilityLabel: (copy) => copy("Aşağı ok", "Arrow down") },
  { key: "left", label: "←", accessibilityLabel: (copy) => copy("Sol ok", "Arrow left") },
  { key: "right", label: "→", accessibilityLabel: (copy) => copy("Sağ ok", "Arrow right") },
  { key: "escape", label: "esc", accessibilityLabel: (copy) => copy("Esc tuşu", "Escape key") },
];
const MODIFIERS: BarModifier[] = [
  {
    modifier: "ctrl", label: "CTRL", accessibilityLabel: (copy, armed) => armed
      ? copy("Ctrl açık: sonraki tuş kontrol karakteri olarak gönderilir", "Ctrl on: the next key is sent as a control character")
      : copy("Ctrl: sonraki tuşu kontrol karakteri olarak gönder", "Ctrl: send the next key as a control character"),
  },
  {
    modifier: "alt", label: "ALT", accessibilityLabel: (copy, armed) => armed
      ? copy("Alt açık: sonraki tuş Alt ile gönderilir", "Alt on: the next key is sent with Alt")
      : copy("Alt: sonraki tuşu Alt ile gönder", "Alt: send the next key with Alt"),
  },
];
const TRAILING_KEYS: BarKey[] = [
  { key: "tab", label: "tab", accessibilityLabel: (copy) => copy("Tab tuşu", "Tab key") },
  { key: "clear", label: "CLEAR", accessibilityLabel: (copy) => copy("Ekranı temizle (Ctrl-L)", "Clear screen (Ctrl-L)") },
  { key: "tilde", label: "~", accessibilityLabel: (copy) => copy("Tilde", "Tilde") },
  { key: "pipe", label: "|", accessibilityLabel: (copy) => copy("Dikey çizgi", "Vertical bar") },
  { key: "slash", label: "/", accessibilityLabel: (copy) => copy("Eğik çizgi", "Slash") },
  { key: "dash", label: "-", accessibilityLabel: (copy) => copy("Kısa çizgi", "Hyphen") },
];

/**
 * The keys a phone keyboard lacks, docked above the keyboard: one scrolling row of key caps (arrows,
 * Esc, sticky one-shot Ctrl and Alt, Tab, Clear and shell symbols) with paste and the keyboard
 * toggle pinned at the end. The row fades where it passes under the pinned buttons. Taps never take
 * focus from the terminal, so the keyboard stays open.
 */
export function TerminalKeyBar({ disabled, modifiers, keyboardVisible, onKey, onToggleModifier, onPaste, onToggleKeyboard }: {
  disabled: boolean;
  modifiers: TerminalModifiers;
  keyboardVisible: boolean;
  onKey: (key: TerminalBarKey) => void;
  onToggleModifier: (modifier: TerminalModifier) => void;
  onPaste: () => void;
  onToggleKeyboard: () => void;
}) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  const tint = disabled ? colors.muted : colors.text;
  const keyCap = ({ key, label, accessibilityLabel }: BarKey) => (
    <Button key={key} label={label} accessibilityLabel={accessibilityLabel(copy)} density="compact" tone="secondary"
      reserveTouchTarget disabled={disabled} style={{ borderRadius: radii.pill }} onPress={() => onKey(key)} />
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.xs }}>
      <ScrollFade edges="both" size={space.xl} color={colors.background} style={{ flex: 1 }}>
        <ScrollView horizontal keyboardShouldPersistTaps="always" showsHorizontalScrollIndicator={false}
          alwaysBounceHorizontal={false} overScrollMode="never"
          accessibilityLabel={copy("Terminal tuşları", "Terminal keys")} style={{ flex: 1 }}
          contentContainerStyle={{ gap: space.xs, alignItems: "center" }}>
          {LEADING_KEYS.map(keyCap)}
          {MODIFIERS.map(({ modifier, label, accessibilityLabel }) => (
            <Button key={modifier} label={label} accessibilityLabel={accessibilityLabel(copy, modifiers[modifier])}
              selected={modifiers[modifier]} density="compact" tone="secondary" reserveTouchTarget disabled={disabled}
              style={{ borderRadius: radii.pill }} onPress={() => onToggleModifier(modifier)} />
          ))}
          {TRAILING_KEYS.map(keyCap)}
        </ScrollView>
      </ScrollFade>
      <IconButton label={copy("Panodan yapıştır", "Paste from clipboard")} reserveTouchTarget disabled={disabled} onPress={onPaste}>
        <ClipboardPaste size={iconSize.action} color={tint} />
      </IconButton>
      <IconButton label={keyboardVisible ? copy("Klavyeyi gizle", "Hide keyboard") : copy("Klavyeyi göster", "Show keyboard")}
        reserveTouchTarget disabled={disabled && !keyboardVisible} onPress={onToggleKeyboard}>
        {keyboardVisible
          ? <KeyboardOff size={iconSize.action} color={colors.accent} />
          : <KeyboardIcon size={iconSize.action} color={colors.accent} />}
      </IconButton>
    </View>
  );
}
