import { useLayoutEffect, useState, type ReactElement } from "react";
import { Tooltip } from "panelui-native/components/tooltip";
import { usePrivateContentAccess } from "./private-access";

/** A long press explains an icon without activating its ordinary action. */
export function Hint({ label, children, stretch = false }: { label: string; children: ReactElement<any>; stretch?: boolean }) {
  const access = usePrivateContentAccess();
  const permitted = access.allowed && access.check();
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => { if (!permitted) setOpen(false); }, [permitted]);
  return <Tooltip label={label} open={permitted && open}
    onOpenChange={(next) => setOpen(next && access.allowed && access.check())} duration={2500}>
    <Tooltip.Trigger className={stretch ? "self-stretch w-full" : undefined}>{children}</Tooltip.Trigger>
    <Tooltip.Content><Tooltip.Text>{label}</Tooltip.Text></Tooltip.Content>
  </Tooltip>;
}
