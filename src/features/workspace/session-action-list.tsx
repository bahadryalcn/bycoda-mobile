import { cloneElement, isValidElement, type ReactElement } from "react";
import { View } from "react-native";
import { NavigationGroup, NavigationRow } from "@/ui/primitives";
import { IconTile } from "@/ui/icon-tile";
import { groupMenuActions } from "@/ui/overflow-menu";
import { space } from "@/ui/tokens";
import { useMobileTheme } from "@/ui/theme";

export type SessionSheetAction = {
  key: string;
  label: string;
  icon?: ReactElement<{ color?: string; size?: number }> | unknown;
  /** Why the action is unavailable, or what it does. */
  detail?: string;
  destructive?: boolean;
  disabled?: boolean;
  busy?: boolean;
  /** Opens another surface (shows a chevron). */
  opens?: boolean;
  onPress(): void;
};

/** Icon-tile command list for the session actions sheet; destructive items sit last in danger tone. */
export function SessionActionList({ actions }: { actions: readonly SessionSheetAction[] }) {
  const { colors, semanticColors } = useMobileTheme();
  return (
    <View style={{ gap: space.sm }}>
      {groupMenuActions(actions).map((group, groupIndex) => (
        <NavigationGroup key={groupIndex}>
          {group.map((action, index) => (
            <NavigationRow
              key={action.key}
              intent={action.opens ? "navigate" : "command"}
              label={action.label}
              detail={action.detail}
              detailLines={0}
              detailSelectable={false}
              tone={action.destructive ? "danger" : undefined}
              disabled={action.disabled}
              busy={action.busy}
              separator={index < group.length - 1}
              onPress={action.onPress}
              icon={
                isValidElement<{ color?: string; size?: number; strokeWidth?: number }>(action.icon) ? (
                  <IconTile>
                    {cloneElement(action.icon, {
                      size: 18,
                      strokeWidth: 2,
                      color: action.destructive ? semanticColors.danger.text : colors.muted,
                    })}
                  </IconTile>
                ) : undefined
              }
            />
          ))}
        </NavigationGroup>
      ))}
    </View>
  );
}
