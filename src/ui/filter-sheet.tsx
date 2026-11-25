import type { ComponentType, PropsWithChildren } from "react";
import { View } from "react-native";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import { IconButton } from "./buttons";
import { radii, space } from "./tokens";
import { FormActions, Sheet } from "./dialogs";
import { useCopy } from "./copy";
import { Body } from "./typography";
import { useMobileTheme } from "./theme";

type FilterIcon = ComponentType<{ size?: number; color?: string }>;

/**
 * `label` and `icon` name what the sheet edits: "Filters" by default, or e.g. "View" for a list
 * whose sheet only arranges (groups/sorts) rather than narrows.
 */
export function FilterButton({ count, onPress, label: customLabel, icon: Icon = SlidersHorizontal }: {
  count: number; onPress: () => void; label?: string; icon?: FilterIcon;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const label = customLabel ?? copy("Filtreler", "Filters");
  // Icon only: the same sliders trigger on every list. A dot marks applied filters; the count is spoken.
  return (
    <View>
      <IconButton label={count ? `${label} · ${count}` : label} onPress={onPress}>
        <Icon size={18} color={count ? colors.accent : colors.muted} />
      </IconButton>
      {count ? (
        <View accessible={false} pointerEvents="none" style={{
          position: "absolute", top: space.sm, end: space.sm, width: space.sm + space.xxs, height: space.sm + space.xxs,
          borderRadius: radii.pill, backgroundColor: colors.accent,
        }} />
      ) : null}
    </View>
  );
}

/** Filter edits stay local until Apply; the shared sheet action area never scrolls away. */
export function FilterSheet({ visible, title, onClose, onApply, onReset, applyDisabled = false, children }: PropsWithChildren<{
  visible: boolean;
  /** Defaults to "Filters"; matches the trigger's `label`. */
  title?: string;
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
  applyDisabled?: boolean;
}>) {
  const copy = useCopy();
  return (
    <Sheet visible={visible} title={title ?? copy("Filtreler", "Filters")} size="compact" onClose={onClose}>
      {children}
      <FormActions submitLabel={copy("Uygula", "Apply")} onSubmit={onApply} disabled={applyDisabled}
        cancelLabel={copy("Sıfırla", "Reset")} onCancel={onReset} />
    </Sheet>
  );
}

/** Applied state only: staged choices stay inside the filter editor until Apply. */
export function AppliedFilters({ filters, result }: {
  filters: readonly (string | false | null | undefined)[];
  result?: string;
}) {
  const { uiStyles } = useMobileTheme();
  const copy = useCopy();
  const labels = filters.filter((label): label is string => typeof label === "string" && !!label);
  const text = [result, ...labels].filter(Boolean).join(" · ");
  const spoken = [result, labels.length ? `${copy("Filtreler", "Filters")}: ${labels.join(" · ")}` : null].filter(Boolean).join(" · ");
  return text ? <Body muted accessibilityLabel={spoken} style={uiStyles.caption}>{text}</Body> : null;
}
