import type { ReactNode } from "react";
import { View } from "react-native";
import { useMobileTheme } from "./theme";
import { Body } from "./typography";
import { SegmentedControl } from "./segmented-control";
import { useInfoHint } from "./info-hint";
import { RowIcon, useInNavigationGroup } from "./navigation-row";
import type { SelectionOption } from "./selection-model";
import { gapIcon, metrics, space } from "./tokens";

/**
 * Settings control rules (one family for every settings screen):
 * - on/off: `ToggleField` (trailing Switch, whole row toggles);
 * - one of 2-4 peers: `SegmentedRow` (this file);
 * - one of many: `SelectField variant="row"` (current value, opens a picker with a single check style);
 * - read-only current value: `ValueRow`;
 * - destination: `NavigationRow` with chevron; command: `NavigationRow intent="command"`;
 * - destructive: `NavigationRow tone="danger"` last in its section.
 * Rows share a 52dp minimum, NavigationRow's horizontal padding, icon slot and inset separator.
 */

/** Shared row chrome: list padding and the inset separator inside a NavigationGroup. */
function SettingRowFrame({ children }: { children: ReactNode }) {
  const { uiStyles } = useMobileTheme();
  const grouped = useInNavigationGroup();
  return (
    <View>
      <View
        style={{
          minHeight: metrics.rowHeightProject,
          paddingHorizontal: grouped ? space.sm : 0,
          marginHorizontal: grouped ? -space.sm : 0,
          paddingVertical: space.row,
          gap: space.sm,
        }}
      >
        {children}
      </View>
      {grouped ? <View accessible={false} style={uiStyles.separator} /> : null}
    </View>
  );
}

/**
 * A choice among two to four peers: label (optional leading icon and info icon) above a
 * SegmentedControl. `help` is revealed by the info icon, never printed under the control.
 */
export function SegmentedRow<T extends string>({
  label,
  help,
  icon,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  help?: string;
  icon?: ReactNode;
  value: T;
  options: readonly SelectionOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const { uiStyles } = useMobileTheme();
  const info = useInfoHint(help);
  return (
    <SettingRowFrame>
      <View style={{ flexDirection: "row", alignItems: "center", gap: gapIcon }}>
        {icon ? <View style={uiStyles.rowLeading}>{icon}</View> : null}
        {/* The label takes the free width: shrink-wrapped, Samsung's font measured it one word
            narrow, wrapped the last word and clipped that second line. */}
        <Body style={[uiStyles.label, uiStyles.grow]}>{label}</Body>
        {info.button}
      </View>
      {info.panel}
      <SegmentedControl label={label} hideLabel value={value} options={options} onChange={onChange} disabled={disabled} />
    </SettingRowFrame>
  );
}

/**
 * A read-only label with a current value (sizes, status) and/or a trailing control. Values wrap instead of truncating.
 * `children` sit under the label/value line inside the same row, e.g. a meter for a share of capacity.
 */
export function ValueRow({ label, value, icon, trailing, children }: { label: string; value?: string; icon?: ReactNode; trailing?: ReactNode; children?: ReactNode }) {
  const { uiStyles } = useMobileTheme();
  return (
    <SettingRowFrame>
      <View
        accessible={!trailing}
        accessibilityLabel={value ? `${label}: ${value}` : label}
        style={{ flexDirection: "row", alignItems: "center", gap: gapIcon }}
      >
        {icon ? <View style={uiStyles.rowLeading}>{icon}</View> : null}
        <Body style={[uiStyles.label, uiStyles.grow]}>{label}</Body>
        {value ? <Body muted style={{ flexShrink: 1, textAlign: "right", fontVariant: ["tabular-nums"] }}>{value}</Body> : null}
        {trailing}
      </View>
      {children}
    </SettingRowFrame>
  );
}

/** Settings rows use the shared list-row glyph (`RowIcon`): no tile, 20dp, muted. */
export const SettingIcon = RowIcon;
