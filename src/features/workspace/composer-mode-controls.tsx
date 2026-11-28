import X from "lucide-react-native/icons/x";
import { useCopy } from "@/ui/copy";
import { Button } from "@/ui/primitives";
import { useMobileTheme } from "@/ui/theme";
import type { ComposerMode } from "./composer-mode";

/**
 * The active turn mode (chosen in "Add to message"), visible above the field; pressing it turns the
 * mode off. Plan mode and Save as draft are mutually exclusive. Shell is the leading `!` of a
 * command run on the computer; turning it off removes the `!`.
 */
export function ComposerModeChip({
  mode,
  disabled,
  onRemove,
}: {
  mode: ComposerMode | "shell";
  disabled?: boolean;
  onRemove: () => void;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const label =
    mode === "plan"
      ? copy("Plan modu", "Plan mode")
      : mode === "shell"
        ? copy("Kabuk", "Shell")
        : copy("Taslak olarak kaydet", "Save as draft");
  return (
    <Button
      label={label}
      accessibilityLabel={`${label}. ${copy("Kapatmak için dokun", "Tap to turn off")}`}
      tone="secondary"
      density="compact"
      reserveTouchTarget
      disabled={disabled}
      onPress={onRemove}
    >
      <X size={14} strokeWidth={2.4} color={colors.muted} />
    </Button>
  );
}
