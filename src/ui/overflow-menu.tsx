import { useMobileTheme } from "./theme";
import { useState, type ReactNode } from "react";
import { View } from "react-native";
import MoreHorizontal from "lucide-react-native/icons/ellipsis";
import CheckGlyph from "lucide-react-native/icons/check";
import { Menu } from "panelui-native/components/menu";
import { IconButton } from "./buttons";
import { useCopy } from "./copy";
import { haptic } from "./motion";
import { colors, radii, space } from "./tokens";

export type MenuAction = {
  key: string;
  label: string;
  onPress: () => void;
  icon?: ReactNode;
  detail?: string;
  destructive?: boolean;
  disabled?: boolean;
  /** Shows a check mark; use for filter/sort choices. */
  selected?: boolean;
};

/**
 * iOS-style popover menu for secondary actions, filters and sorting. The default trigger is a
 * circular "…" button; pass `trigger` for a custom IconButton (e.g. a filter glyph).
 */
export function ActionMenu({
  label,
  actions,
  trigger,
  active,
}: {
  label: string;
  actions: readonly (MenuAction | false | null | undefined)[];
  trigger?: ReactNode;
  /** Marks the trigger as having an active filter. */
  active?: boolean;
}) {
  useMobileTheme();
  const copy = useCopy();
  const [open, setOpen] = useState(false);
  const items = actions.filter(Boolean) as MenuAction[];
  if (!items.length) return null;
  return (
    <Menu open={open} onOpenChange={setOpen}>
      <Menu.Trigger>
        <IconButton label={label || copy("Diğer işlemler", "More actions")} expanded={open} onPress={() => haptic.select()}>
          <View>
            {trigger ?? <MoreHorizontal size={22} strokeWidth={2} color={colors.accent} />}
            {active ? (
              <View
                style={{
                  position: "absolute",
                  top: -2,
                  end: -3,
                  width: 8,
                  height: 8,
                  borderRadius: radii.pill,
                  backgroundColor: colors.accentSolid,
                }}
              />
            ) : null}
          </View>
        </IconButton>
      </Menu.Trigger>
      <Menu.Content
        placement="bottom"
        align="end"
        offset={space.xs}
        width={260}
        className="rounded-card bg-popover border-0 p-ui-xs shadow-lg"
      >
        {items.map((item) => (
          <Menu.Item
            key={item.key}
            accessibilityLabel={[item.label, item.detail].filter(Boolean).join(". ")}
            accessibilityState={{ disabled: !!item.disabled, selected: item.selected }}
            disabled={item.disabled}
            variant={item.destructive ? "destructive" : undefined}
            icon={item.icon}
            description={item.detail}
            trailing={item.selected ? <Check /> : undefined}
            onSelect={item.onPress}
          >
            {item.label}
          </Menu.Item>
        ))}
      </Menu.Content>
    </Menu>
  );
}

function Check() {
  return <CheckGlyph size={17} strokeWidth={2.6} color={colors.accent} />;
}
