import type { ReactNode } from "react";
import { SwipeActions } from "@/ui/swipe-actions";
import { useSessionActions, type SessionActionsProps } from "./session-actions";

export type SessionRowActionsProps = SessionActionsProps & {
  children(openActions: () => void): ReactNode;
};

/** A session list row's options (long press or the named accessibility action) through the shared session actions. */
export function SessionRowActions({ children, ...props }: SessionRowActionsProps) {
  const actions = useSessionActions(props);
  return (
    <>
      <SwipeActions actions={actions.swipeActions} disabled={!actions.available || actions.busy}>
        {children(actions.openActions)}
      </SwipeActions>
      {actions.element}
    </>
  );
}
