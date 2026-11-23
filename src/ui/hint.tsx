import { useLayoutEffect, useState, type ReactElement } from "react";
import { Tooltip } from "panelui-native/components/tooltip";
import { usePrivateContentAccess } from "./private-access";

/** Long press explains an action. A dedicated information icon can open on tap. */
export function Hint({ label, children, stretch = false, openOn = "longPress" }: {
  label: string;
  children: ReactElement<any>;
  stretch?: boolean;
  openOn?: "longPress" | "press";
}) {
  const access = usePrivateContentAccess();
  const permitted = access.allowed && access.check();
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => { if (!permitted) setOpen(false); }, [permitted]);
  const dedicated = openOn === "press";
  return (
    <Tooltip
      label={label}
      open={permitted && open}
      openOn={openOn}
      onOpenChange={(next) => setOpen(next && access.allowed && access.check())}
      duration={dedicated ? 6000 : 2500}
    >
      <Tooltip.Trigger className={stretch ? "self-stretch w-full" : undefined}>{children}</Tooltip.Trigger>
      <Tooltip.Content
        variant={dedicated ? "surface" : undefined}
        style={dedicated ? { maxWidth: 280 } : undefined}
        accessible={dedicated ? false : undefined}
        accessibilityElementsHidden={dedicated || undefined}
        importantForAccessibility={dedicated ? "no-hide-descendants" : undefined}
      >
        <Tooltip.Text>{label}</Tooltip.Text>
      </Tooltip.Content>
    </Tooltip>
  );
}
