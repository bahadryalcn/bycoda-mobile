import { useMobileTheme } from "./theme";
import { cloneElement, isValidElement, useContext, useEffect, useId, useRef, type ContextType, type RefObject, type ReactElement, type ReactNode } from "react";
import { View, useWindowDimensions, type HostInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MoreHorizontal from "lucide-react-native/icons/ellipsis";
import CheckGlyph from "lucide-react-native/icons/check";
import { Menu } from "panelui-native/components/menu";
import { IconButton } from "./buttons";
import { useCopy } from "./copy";
import { haptic } from "./motion";
import { asWebElement } from "./overlay-web-focus";
import { OverlayWebMenuContext } from "./overlay-web-menu-context";
import { usePrivateContentAccess } from "./private-access";
import { useMenuLifecycle } from "./use-menu-lifecycle";
import { Sheet } from "./dialogs";
import { NavigationGroup, NavigationRow } from "./navigation-row";
import { Body } from "./typography";
import { IconTile } from "./icon-tile";
import { radii, space } from "./tokens";

export type MenuAction = {
  key: string;
  label: string;
  onPress: () => void;
  /** Lucide glyph; the phone sheet puts it in an icon tile so labels align. */
  icon?: ReactNode;
  /** Secondary line; a disabled action states its reason here. */
  detail?: string;
  /** Shows a chevron: the action opens another surface rather than running a command. */
  opens?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  /** Shows a check mark; use for filter/sort choices. */
  selected?: boolean;
};

/**
 * Menu for secondary actions, filters and sorting. Phones open a bottom sheet titled `label`
 * (with `subtitle`, usually the record name) listing icon-tile rows, destructive actions last;
 * web keeps a popover. The default trigger is a circular "…" button; pass `trigger` for a custom
 * IconButton (e.g. a filter glyph).
 */
export function ActionMenu({
  label,
  subtitle,
  actions,
  trigger,
  active,
  busy,
}: {
  label: string;
  /** Record the menu acts on; shown under the sheet title. */
  subtitle?: string;
  actions: readonly (MenuAction | false | null | undefined)[];
  trigger?: ReactNode;
  /** Marks the trigger as having an active filter. */
  active?: boolean;
  /** Pending work initiated by a menu item stays visible after the menu closes. */
  busy?: boolean;
}) {
  const { colors } = useMobileTheme();
  const copy = useCopy();
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const maxHeight = Math.max(0, height - insets.top - insets.bottom - space.screen * 2);
  const anchor = useRef<HostInstance>(null);
  const focusRegistry = useContext(OverlayWebMenuContext);
  const access = usePrivateContentAccess();
  const items = actions.filter(Boolean) as MenuAction[];
  const { open, available, onOpenChange, close, select } = useMenuLifecycle(items, access);
  const menuLabel = label || copy("Diğer işlemler", "More actions");
  if (!available) return null;
  return (
    <Menu open={open} onOpenChange={onOpenChange}>
      <Menu.Trigger>
        <IconButton label={menuLabel} busy={busy} expanded={open} onPress={() => haptic.select()}>
          <View ref={anchor} collapsable={false}>
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
      {process.env.EXPO_OS === "web" ? <Menu.Content
        accessibilityLabel={menuLabel}
        placement="bottom"
        align="end"
        offset={space.xs}
        width={260}
        // Upstream caps its positioning wrapper; the visible panel needs the same
        // constraint so its existing ScrollView receives a bounded viewport.
        maxHeight={maxHeight}
        style={{ maxHeight }}
        className="rounded-card bg-popover border border-border p-ui-xs shadow-none"
      >
        <MenuFocusScope registry={focusRegistry} anchor={anchor} access={access} onClose={close} label={menuLabel}>
        {items.map((item) => (
          <Menu.Item
            key={item.key}
            className="min-h-touch web:focus-visible:outline-2 web:focus-visible:outline-ring"
            accessibilityState={{ disabled: !!item.disabled, selected: item.selected }}
            disabled={item.disabled}
            variant={item.destructive ? "destructive" : undefined}
            icon={item.icon}
            description={item.detail}
            trailing={item.selected ? <Check /> : undefined}
            onSelect={() => select(item)}
          >
            {item.label}
          </Menu.Item>
        ))}
        </MenuFocusScope>
      </Menu.Content> : null}
      {process.env.EXPO_OS === "web" ? null : (
        <Sheet visible={open} title={menuLabel} size="compact" onClose={close}>
          {subtitle ? <Body muted numberOfLines={2}>{subtitle}</Body> : null}
          <ActionRows items={items} onSelect={select} />
        </Sheet>
      )}
    </Menu>
  );
}

/** Splits into regular and destructive groups; destructive actions always come last. */
export function groupMenuActions<T extends { destructive?: boolean }>(items: readonly T[]): T[][] {
  const regular = items.filter((item) => !item.destructive);
  const danger = items.filter((item) => item.destructive);
  return [regular, danger].filter((group) => group.length > 0);
}

function ActionRows({ items, onSelect }: { items: readonly MenuAction[]; onSelect(item: MenuAction): void }) {
  const { colors, semanticColors } = useMobileTheme();
  return (
    <View style={{ gap: space.sm }}>
      {groupMenuActions(items).map((group, groupIndex) => (
        <NavigationGroup key={groupIndex}>
          {group.map((item, index) => (
            <NavigationRow
              key={item.key}
              intent={item.opens ? "navigate" : "command"}
              label={item.label}
              detail={item.detail}
              detailLines={0}
              detailSelectable={false}
              tone={item.destructive ? "danger" : undefined}
              disabled={item.disabled}
              separator={index < group.length - 1}
              selected={item.selected}
              tintSelected={false}
              icon={isValidElement(item.icon) ? (
                <IconTile>
                  {cloneElement(item.icon as ReactElement<{ size?: number; strokeWidth?: number; color?: string }>, {
                    size: 18,
                    strokeWidth: 2,
                    color: item.destructive ? semanticColors.danger.text : colors.muted,
                  })}
                </IconTile>
              ) : undefined}
              trailing={item.selected ? <Check /> : undefined}
              onPress={() => onSelect(item)}
            />
          ))}
        </NavigationGroup>
      ))}
    </View>
  );
}

function Check() {
  const { colors } = useMobileTheme();
  return <CheckGlyph size={17} strokeWidth={2.6} color={colors.accent} />;
}

/** Portal context is re-provided upstream only for Menu itself; pass our owner explicitly. */
function MenuFocusScope({ registry, anchor, access, onClose, label, children }: {
  registry: ContextType<typeof OverlayWebMenuContext>;
  anchor: RefObject<HostInstance | null>;
  access: ReturnType<typeof usePrivateContentAccess>;
  onClose(): void;
  label: string;
  children: ReactNode;
}) {
  const element = useRef<HostInstance>(null);
  const id = useId();
  useEffect(() => {
    if (process.env.EXPO_OS !== "web" || !registry) return;
    const node = asWebElement(element.current)?.closest<HTMLElement>('[role="menu"]');
    const source = asWebElement(anchor.current);
    if (!node || !source) return;
    return registry.register({ id, element: node, anchor: source, check: access.check, onClose, label });
  }, [registry, id, anchor, access, onClose, label]);
  return <View ref={element} collapsable={false} style={{ gap: space.xs }}>{children}</View>;
}
