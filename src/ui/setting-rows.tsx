import type { ComponentType, ReactNode } from "react";
import { IconTile } from "./icon-tile";
import { View } from "react-native";
import { useMobileTheme } from "./theme";
import { Body } from "./typography";
import { SegmentedControl } from "./segmented-control";
import { useInfoHint } from "./info-hint";
import { useInNavigationGroup } from "./navigation-row";
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
        {icon}
        <Body style={[uiStyles.label, { flexShrink: 1 }]}>{label}</Body>
        {info.button}
      </View>
      {info.panel}
      <SegmentedControl label={label} hideLabel value={value} options={options} onChange={onChange} disabled={disabled} />
    </SettingRowFrame>
  );
}

/** A read-only label with a current value (sizes, status) and/or a trailing control. Values wrap instead of truncating. */
export function ValueRow({ label, value, icon, trailing }: { label: string; value?: string; icon?: ReactNode; trailing?: ReactNode }) {
  const { uiStyles } = useMobileTheme();
  return (
    <SettingRowFrame>
      <View
        accessible={!trailing}
        accessibilityLabel={value ? `${label}: ${value}` : label}
        style={{ flexDirection: "row", alignItems: "center", gap: gapIcon }}
      >
        {icon}
        <Body style={[uiStyles.label, uiStyles.grow]}>{label}</Body>
        {value ? <Body muted style={{ flexShrink: 1, textAlign: "right", fontVariant: ["tabular-nums"] }}>{value}</Body> : null}
        {trailing}
      </View>
    </SettingRowFrame>
  );
}

/**
 * 32dp icon well for a settings row's leading slot; pass a lucide glyph component. Neutral by default;
 * `tone="danger"` matches a destructive row's label so the glyph does not read as a safe action.
 */
export function SettingIcon({ glyph: Glyph, tone }: {
  glyph: ComponentType<{ size?: number; strokeWidth?: number; color?: string }>; tone?: "danger";
}) {
  const { colors, semanticColors } = useMobileTheme();
  const color = tone ? semanticColors[tone].text : colors.muted;
  return (
    <IconTile color={color}>
      <Glyph size={18} strokeWidth={2} color={color} />
    </IconTile>
  );
}
