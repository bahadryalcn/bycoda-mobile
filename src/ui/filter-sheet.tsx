import type { ComponentType, PropsWithChildren } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import SlidersHorizontal from "lucide-react-native/icons/sliders-horizontal";
import { ChoiceChip, IconButton } from "./buttons";
import { iconSize, metrics, radii, space } from "./tokens";
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
        <Icon size={iconSize.action} color={count ? colors.accent : colors.muted} />
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

/**
 * Filter edits stay local until Apply; the shared sheet action area never scrolls away. Staged edits
 * end in Apply, while `useCollapsibleSearch` (which applies live) ends in Done. Pass `activeCount`
 * (applied or staged non-default filters) so Reset shows only when there is something to reset,
 * like the live search sheet; without it Reset always shows.
 */
export function FilterSheet({ visible, title, onClose, onApply, onReset, applyDisabled = false, activeCount, children }: PropsWithChildren<{
  visible: boolean;
  /** Defaults to "Filters"; matches the trigger's `label`. */
  title?: string;
  onClose: () => void;
  onApply: () => void;
  onReset: () => void;
  applyDisabled?: boolean;
  activeCount?: number;
}>) {
  const copy = useCopy();
  const resettable = activeCount === undefined || activeCount > 0;
  return (
    <Sheet visible={visible} title={title ?? copy("Filtreler", "Filters")} size="compact" onClose={onClose}>
      {children}
      <FormActions submitLabel={copy("Uygula", "Apply")} onSubmit={onApply} disabled={applyDisabled}
        {...(resettable ? { cancelLabel: copy("Sıfırla", "Reset"), onCancel: onReset } : {})} />
    </Sheet>
  );
}

/**
 * One quick filter as a single horizontally scrolling chip row: the frequent choice stays one tap
 * away without a second toolbar row per option. The row is the list's only quick filter; secondary
 * filters stay in FilterSheet. Chips grow with large text instead of clipping their label.
 */
export function FilterChipRow<T extends string>({ label, value, options, onChange, disabled = false, wrap = false }: {
  /** Inside the filter sheet: chips wrap onto lines instead of scrolling sideways. */
  wrap?: boolean;
  /** Spoken name of the filter; not shown, the chips name themselves. */
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  useMobileTheme();
  const { fontScale } = useWindowDimensions();
  const grow = fontScale > 1 ? { height: "auto" as const, minHeight: metrics.chipHeight, paddingVertical: space.xs } : null;
  if (wrap) return (
    <View accessibilityLabel={label} style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      {options.map((option) => (
        <ChoiceChip key={option.value} label={option.label} selected={!disabled && value === option.value}
          disabled={disabled} style={grow} onPress={() => onChange(option.value)} />
      ))}
    </View>
  );
  return (
    <ScrollView
      horizontal
      accessibilityLabel={label}
      // Chips that fit never bounce or glow sideways; only an overflowing row scrolls.
      alwaysBounceHorizontal={false}
      overScrollMode="never"
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      style={{ flexGrow: 0 }}
      contentContainerStyle={{ columnGap: space.sm, alignItems: "center" }}
    >
      {options.map((option) => (
        <ChoiceChip key={option.value} label={option.label} selected={!disabled && value === option.value}
          disabled={disabled} style={grow} onPress={() => onChange(option.value)} />
      ))}
    </ScrollView>
  );
}

/**
 * Applied state only: staged choices stay inside the filter editor until Apply.
 * @deprecated The design system has no applied-filter summary rows; the filter icon's dot shows
 * applied state. Do not add consumers; the remaining Jira board and pull request callers migrate
 * with their owners.
 */
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
