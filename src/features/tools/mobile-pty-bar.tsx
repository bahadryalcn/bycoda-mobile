import { ScrollView, View } from "react-native";
import ChevronDown from "lucide-react-native/icons/chevron-down";
import ChevronLeft from "lucide-react-native/icons/chevron-left";
import ChevronRight from "lucide-react-native/icons/chevron-right";
import ChevronUp from "lucide-react-native/icons/chevron-up";
import { Button, IconButton } from "@/ui/primitives";
import { useCopy } from "@/ui/copy";
import { useMobileTheme } from "@/ui/theme";
import { metrics, space } from "@/ui/tokens";
import { PTY_KEYS } from "./mobile-pty-model";

/**
 * Terminal keys a phone keyboard lacks and the resume action for a paused terminal.
 */
export function MobilePtyBar({
  paused,
  busyResume,
  canType,
  disabled,
  onResume,
  onKey,
  keyboardVisible,
}: {
  paused: boolean;
  busyResume: boolean;
  /** Input is accepted right now. */
  canType: boolean;
  disabled: boolean;
  onResume: () => void;
  onKey: (dataBase64: string) => void;
  keyboardVisible: boolean;
}) {
  const copy = useCopy();
  const { colors } = useMobileTheme();
  if (!keyboardVisible && !paused) return null;
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
      {keyboardVisible ? (
        <ScrollView
          horizontal
          fadingEdgeLength={space.lg}
          keyboardShouldPersistTaps="always"
          accessibilityLabel={copy("Terminal tuşları", "Terminal keys")}
          style={{ flexGrow: 0 }}
          contentContainerStyle={{ flexGrow: 1, gap: space.xs, paddingHorizontal: space.sm, paddingTop: space.xs }}
        >
          {keys.map((key) => (
            <View key={key.id} style={{ flexGrow: 1, minWidth: metrics.touchTarget }}>
              {key.glyph ? (
                <IconButton label={key.label} reserveTouchTarget disabled={!canType} onPress={() => onKey(key.data)}>
                  {icon(key.glyph)}
                </IconButton>
              ) : (
                <Button label={key.label} density="compact" tone="secondary" reserveTouchTarget disabled={!canType}
                  onPress={() => onKey(key.data)} />
              )}
            </View>
          ))}
        </ScrollView>
      ) : null}
      {paused ? (
        <View style={{ alignItems: "flex-start", paddingHorizontal: space.screen, paddingVertical: space.xs }}>
          <Button label={copy("Sürdür", "Resume")} density="compact" tone="secondary" reserveTouchTarget
            busy={busyResume} disabled={disabled} onPress={onResume} />
        </View>
      ) : null}
    </View>
  );
}
