import { useEffect, useState } from "react";
import { View } from "react-native";
import { KeyboardController, useKeyboardState } from "react-native-keyboard-controller";
import Keyboard from "lucide-react-native/icons/keyboard";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import ChevronUp from "lucide-react-native/icons/chevron-up";
import { Button, ErrorText, IconButton } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { space } from "@/ui/tokens";
import { PTY_KEYS } from "./mobile-pty-model";

/**
 * Bottom bar of the full-screen terminal: Resume when input is paused, a
 * keyboard toggle, and, while the keyboard is open, a row of keys a phone keyboard lacks.
 */
export function MobilePtyBar({
  paused,
  busyResume,
  canType,
  disabled,
  onResume,
  onKey,
  onShowKeyboard,
  onAttachOutput,
}: {
  paused: boolean;
  busyResume: boolean;
  /** Input is accepted right now. */
  canType: boolean;
  disabled: boolean;
  onResume: () => void;
  onKey: (dataBase64: string) => void;
  onShowKeyboard: () => void;
  /** Appends the recent output to the session draft; throws when there is nothing to attach. */
  onAttachOutput?: () => void;
}) {
  const copy = useCopy();
  const [attached, setAttached] = useState(false);
  const [attachError, setAttachError] = useState<unknown>(null);
  useEffect(() => {
    if (!attached) return;
    const timer = setTimeout(() => setAttached(false), 2000);
    return () => clearTimeout(timer);
  }, [attached]);
  const { colors } = useMobileTheme();
  const keyboard = useKeyboardState((state) => state.isVisible);
  const icon = (Glyph: typeof ChevronUp) => <Glyph size={20} color={colors.text} />;
  const keys: { id: string; label: string; data: string; glyph?: typeof ChevronUp }[] = [
    { id: "esc", label: "Esc", data: PTY_KEYS.escape },
    { id: "tab", label: "Tab", data: PTY_KEYS.tab },
    { id: "ctrl-c", label: "Ctrl-C", data: PTY_KEYS.interrupt },
    { id: "left", label: copy("Sol ok", "Arrow left"), data: PTY_KEYS.left, glyph: ChevronLeft },
    { id: "down", label: copy("Aşağı ok", "Arrow down"), data: PTY_KEYS.down, glyph: ChevronDown },
    { id: "up", label: copy("Yukarı ok", "Arrow up"), data: PTY_KEYS.up, glyph: ChevronUp },
    { id: "right", label: copy("Sağ ok", "Arrow right"), data: PTY_KEYS.right, glyph: ChevronRight },
  ];
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.background }}>
      {keyboard ? (
        <View
          accessibilityLabel={copy("Terminal tuşları", "Terminal keys")}
          style={{ flexDirection: "row", gap: space.xs, paddingHorizontal: space.sm, paddingTop: space.xs }}
        >
          {keys.map((key) => (
            <View key={key.id} style={{ flex: 1 }}>
              {key.glyph ? (
                <IconButton label={key.label} disabled={!canType} onPress={() => onKey(key.data)}>
                  {icon(key.glyph)}
                </IconButton>
              ) : (
                <Button label={key.label} density="compact" tone="secondary" disabled={!canType}
                  onPress={() => onKey(key.data)} />
              )}
            </View>
          ))}
        </View>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.screen, paddingVertical: space.xs }}>
        {paused ? (
          <Button label={copy("Sürdür", "Resume")} density="compact" tone="secondary"
            busy={busyResume} disabled={disabled} onPress={onResume} />
        ) : null}
        {onAttachOutput ? (
          <Button label={attached ? copy("Taslağa eklendi", "Added to draft") : copy("Çıktıyı ekle", "Attach output")} density="compact" tone="quiet"
            disabled={attached}
            onPress={() => { try { onAttachOutput(); setAttachError(null); setAttached(true); } catch (error) { setAttachError(error); } }} />
        ) : null}
        <View style={{ flex: 1 }} />
        <IconButton
          label={keyboard ? copy("Klavyeyi gizle", "Hide keyboard") : copy("Klavyeyi göster", "Show keyboard")}
          disabled={!keyboard && !canType}
          onPress={() => (keyboard ? void KeyboardController.dismiss() : onShowKeyboard())}
        >
          <Keyboard size={22} color={colors.accent} />
        </IconButton>
      </View>
      {attachError ? <View style={{ paddingHorizontal: space.screen, paddingBottom: space.xs }}><ErrorText error={attachError} /></View> : null}
    </View>
  );
}
