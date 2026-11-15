import type { ReactNode } from "react";
import CircleDashed from "lucide-react-native/icons/circle-dashed";
import Lightbulb from "lucide-react-native/icons/lightbulb";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import X from "lucide-react-native/icons/x";
import { useCopy } from "@/ui/copy";
import { ActionMenu, Button } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import type { ComposerMode } from "./composer-mode";

/**
 * Turn mode menu: the same modes desktop offers for Host sessions (Plan mode, Draft). Operator and
 * Orchestrator are desktop-local only and are not listed. Modes are mutually exclusive.
 */
export function ComposerModeMenu({
  active,
  blockedReasons,
  onSelect,
}: {
  active: ComposerMode | null;
  /** Why a mode cannot be chosen right now, shown under its title. */
  blockedReasons: Partial<Record<ComposerMode, string>>;
  onSelect: (mode: ComposerMode) => void;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const action = (mode: ComposerMode, label: string, description: string, icon: ReactNode) => ({
    key: mode,
    label,
    detail: blockedReasons[mode] ?? description,
    icon,
    selected: active === mode,
    disabled: !!blockedReasons[mode],
    onPress: () => onSelect(mode),
  });
  return (
    <ActionMenu
      label={copy("Mod", "Mode")}
      active={!!active}
      trigger={<SlidersHorizontal size={18} strokeWidth={2.2} color={active ? colors.accent : colors.muted} />}
      actions={[
        action(
          "plan",
          copy("Plan modu", "Plan mode"),
          copy("Yapmadan önce bir planı incele", "Review a plan before building"),
          <Lightbulb />,
        ),
        action(
          "draft",
          copy("Taslak", "Draft"),
          copy("Bu mesajı agent’ı başlatmadan kaydet", "Save this message without starting the agent"),
          <CircleDashed />,
        ),
      ]}
    />
  );
}

/** The active mode, visible without opening the menu; pressing it turns the mode off. */
export function ComposerModeChip({
  mode,
  disabled,
  onRemove,
}: {
  mode: ComposerMode;
  disabled?: boolean;
  onRemove: () => void;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const label = mode === "plan" ? copy("Plan modu", "Plan mode") : copy("Taslak", "Draft");
  return (
    <Button
      label={label}
      accessibilityLabel={`${label}. ${copy("Kapatmak için dokun", "Tap to turn off")}`}
      tone="secondary"
      density="compact"
      disabled={disabled}
      onPress={onRemove}
    >
      <X size={14} strokeWidth={2.4} color={colors.muted} />
    </Button>
  );
}
