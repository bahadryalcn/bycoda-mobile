import { useMobileTheme } from "./theme";
import { cloneElement, isValidElement, useContext, useEffect, useId, useRef, type ContextType, type RefObject, type ReactElement, type ReactNode } from "react";
import { View, useWindowDimensions, type HostInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import MoreHorizontal from "lucide-react-native/icons/ellipsis";
import CheckGlyph from "lucide-react-native/icons/check";
import { Menu } from "panelui-native/components/menu";
import { Button, IconButton } from "./buttons";
import { useCopy } from "./copy";
import { haptic } from "./motion";
import { asWebElement } from "./overlay-web-focus";
import { OverlayWebMenuContext } from "./overlay-web-menu-context";
import { usePrivateContentAccess } from "./private-access";
import { singleMenuAction, useMenuLifecycle } from "./use-menu-lifecycle";
import { Sheet } from "./dialogs";
import { NavigationGroup, NavigationRow } from "./navigation-row";
import { Body } from "./typography";
import { iconSize, radii, space } from "./tokens";

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
  /**
   * `onPress` opens its own confirmation or review before anything changes. A lone destructive
   * action with this flag is shown directly instead of behind a one-item menu.
   */
  reviewed?: boolean;
  disabled?: boolean;
  /** Shows a check mark; use for filter/sort choices. */
  selected?: boolean;
  /**
   * Row options group (for example "open", "organize", "copy"). Groups keep the order in which
   * they first appear; destructive actions always form the last group. Omit for one group.
   */
  group?: string;
  /** Shows progress on the row, for example while a copy is prepared. */
  busy?: boolean;
};

/**
 * Menu for secondary actions, filters and sorting. Phones open a bottom sheet titled `label`
 * (with `subtitle`, usually the record name) listing icon rows, destructive actions last;
 * web keeps a popover. The default trigger is a circular "…" button; pass `trigger` for a custom
 * IconButton (e.g. a filter glyph).
 *
 * A menu is never opened for one choice: when exactly one non-destructive action is left, it is
 * rendered directly (its icon as a labelled icon button, otherwise a quiet text button) and the
 * "…" trigger disappears. A lone destructive action keeps the menu as its deliberate second step
 * unless it is `reviewed` (it opens its own confirmation), in which case it too is shown directly.
 */
export function ActionMenu({
  label,
  subtitle,
  actions,
  trigger,
  active,
  busy,
  reserveTouchTarget,
  onTriggerPress,
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
  /** Reserve layout space when the trigger sits next to other controls. */
  reserveTouchTarget?: boolean;
  /** Runs when the trigger is pressed, for example to dismiss an overlapping keyboard. */
  onTriggerPress?: () => void;
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
  const only = singleMenuAction(items);
  if (only) return <SingleAction item={only} busy={busy} reserveTouchTarget={reserveTouchTarget} onTriggerPress={onTriggerPress} access={access} />;
  return (
    <Menu open={open} onOpenChange={onOpenChange}>
      <Menu.Trigger>
        <IconButton label={menuLabel} busy={busy} expanded={open}
          reserveTouchTarget={reserveTouchTarget} onPress={() => {
            haptic.select();
            onTriggerPress?.();
          }}>
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

/** A lone menu choice shown in place of the "…" trigger, with the same access check as a menu row. */
function SingleAction({ item, busy, reserveTouchTarget, onTriggerPress, access }: {
  item: MenuAction; busy?: boolean; reserveTouchTarget?: boolean; onTriggerPress?: () => void;
  access: ReturnType<typeof usePrivateContentAccess>;
}) {
  const { colors, semanticColors } = useMobileTheme();
  const run = () => {
    if (item.disabled) return;
    onTriggerPress?.();
    if (!access.allowed || !access.check()) return;
    haptic.select();
    item.onPress();
  };
  const pending = !!(busy || item.busy);
  if (isValidElement(item.icon)) {
    return (
      <IconButton label={item.detail ? `${item.label}. ${item.detail}` : item.label} busy={pending} disabled={item.disabled}
        tone={item.destructive ? "danger" : "default"} reserveTouchTarget={reserveTouchTarget} onPress={run}>
        {cloneElement(item.icon as ReactElement<{ size?: number; strokeWidth?: number; color?: string }>, {
          size: iconSize.action, strokeWidth: 2, color: item.destructive ? semanticColors.danger.text : colors.accent,
        })}
      </IconButton>
    );
  }
  return (
    <Button tone={item.destructive ? "danger" : "quiet"} density="compact" label={item.label} accessibilityLabel={item.detail ? `${item.label}. ${item.detail}` : undefined}
      selected={item.selected} busy={pending} disabled={item.disabled} reserveTouchTarget={reserveTouchTarget} onPress={run} />
  );
}

/**
 * Splits into groups; destructive actions always come last. Items with a `group` key are grouped
 * by it in first-appearance order; items without one share a single regular group.
 */
export function groupMenuActions<T extends { destructive?: boolean; group?: string }>(items: readonly T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    if (item.destructive) continue;
    const key = item.group ?? "";
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const danger = items.filter((item) => item.destructive);
  return [...groups.values(), danger].filter((group) => group.length > 0);
}

/**
 * Shared row options sheet, opened by long-press on a list row (project, session, folder, record)
 * and by the row's accessibility "Show options" action. Title names the kind of options
 * ("Project options"), `subtitle` the record. Choosing an action closes the sheet first, then runs
 * it, so the action can open its own sheet or confirmation. Swipe rails show a subset of the same
 * actions. `children` render below the list (for example a result or failure line).
 */
export function RowOptionsSheet({
  visible,
  title,
  subtitle,
  actions,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  /** Record the options act on; shown under the title. */
  subtitle?: string;
  actions: readonly (MenuAction | false | null | undefined)[];
  onClose: () => void;
  children?: ReactNode;
}) {
  const access = usePrivateContentAccess();
  const items = actions.filter(Boolean) as MenuAction[];
  const select = (item: MenuAction) => {
    if (item.disabled) return;
    onClose();
    // A row whose private content was withdrawn while the sheet was open runs nothing.
    if (!access.allowed || !access.check()) return;
    item.onPress();
  };
  return (
    <Sheet visible={visible && items.length > 0} title={title} size="compact" onClose={onClose}>
      {subtitle ? <Body muted numberOfLines={2}>{subtitle}</Body> : null}
      <ActionRows items={items} onSelect={select} />
      {children}
    </Sheet>
  );
}

/**
 * The grouped icon action list used by `ActionMenu`, `RowOptionsSheet` and sheets that own
 * extra panels (session actions). Each row runs its own `onPress`; destructive rows come last.
 */
export function ActionList({ actions, compact }: {
  actions: readonly (MenuAction | false | null | undefined)[];
  compact?: boolean;
}) {
  const items = actions.filter(Boolean) as MenuAction[];
  return <ActionRows items={items} compact={compact} onSelect={(item) => { if (!item.disabled) item.onPress(); }} />;
}

function ActionRows({ items, onSelect, compact }: { items: readonly MenuAction[]; onSelect(item: MenuAction): void; compact?: boolean }) {
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
              compact={compact}
              detail={item.detail}
              detailLines={0}
              detailSelectable={false}
              tone={item.destructive ? "danger" : undefined}
              disabled={item.disabled}
              busy={item.busy}
              separator={index < group.length - 1}
              selected={item.selected}
              tintSelected={false}
              // The list-row glyph (RowIcon measure): 20, 1.8 stroke, no tile; danger rows tint it.
              icon={isValidElement(item.icon)
                ? cloneElement(item.icon as ReactElement<{ size?: number; strokeWidth?: number; color?: string }>, {
                    size: iconSize.row,
                    strokeWidth: 1.8,
                    color: item.destructive ? semanticColors.danger.text : colors.muted,
                  })
                : undefined}
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
  return <CheckGlyph size={iconSize.check} strokeWidth={2.6} color={colors.accent} />;
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
