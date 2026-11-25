import type { ReactElement } from "react";
import { ActionList } from "@/ui/overflow-menu";

export type SessionSheetAction = {
  key: string;
  /** Desktop menu section; rows keep the order of the section's first appearance. */
  group?: string;
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

/** Session actions through the shared row options list; destructive items sit last in danger tone. */
export function SessionActionList({ actions }: { actions: readonly SessionSheetAction[] }) {
  return (
    <ActionList
      compact
      actions={actions.map((action) => ({ ...action, icon: action.icon as ReactElement | undefined }))}
    />
  );
}
