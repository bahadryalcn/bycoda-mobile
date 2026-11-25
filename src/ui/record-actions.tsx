import { ActionList, type MenuAction } from "./overflow-menu";
import { Sheet } from "./dialogs";
import { Body } from "./typography";
import { haptic } from "./motion";
import { usePrivateContentAccess } from "./private-access";
import { useMenuLifecycle } from "./use-menu-lifecycle";

/** The options of one record: the trailing "…" menu and a long press open the same list. */
export type RecordActions = {
  /** Sheet title and accessible name of the "…" button, e.g. "Task actions". */
  label: string;
  /** Record the actions apply to; defaults to the card title. */
  subtitle?: string;
  items: readonly (MenuAction | false | null | undefined)[];
  /** Work started from a menu item stays visible on the trigger after the sheet closes. */
  busy?: boolean;
};

/**
 * Long-press presentation of a record's actions: the shared `ActionList` rows of the row options
 * sheet, with the same lifecycle guards as `ActionMenu` (private access, stale-key protection).
 */
export function useRecordActionsSheet(actions: RecordActions | undefined, fallbackSubtitle: string) {
  const access = usePrivateContentAccess();
  const items = (actions?.items.filter(Boolean) ?? []) as MenuAction[];
  const { open, available, onOpenChange, close, select } = useMenuLifecycle(items, access);
  const openSheet = () => {
    if (!available) return;
    haptic.select();
    onOpenChange(true);
  };
  const sheet = actions && available ? (
    <Sheet visible={open} title={actions.label} size="compact" onClose={close}>
      <Body muted numberOfLines={2}>{actions.subtitle ?? fallbackSubtitle}</Body>
      {/* The shared row options list; each row goes through the lifecycle guard, not straight to onPress. */}
      <ActionList actions={items.map((item) => ({ ...item, onPress: () => select(item) }))} />
    </Sheet>
  ) : null;
  return { available, open: openSheet, sheet };
}
