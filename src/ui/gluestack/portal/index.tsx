import { usePrivateOverlay } from "../private-overlay";
("use client");
import { Overlay } from "@gluestack-ui/core/overlay/creator";
import { withUniwind } from "uniwind";
import React from "react";

const StyledOverlay = withUniwind(Overlay);

const Portal = React.forwardRef<
  React.ComponentRef<typeof Overlay>,
  React.ComponentProps<typeof Overlay>
>(function Portal({ ...props }, ref) {
  const unlocked = usePrivateOverlay();
  if (!unlocked) return null;
  return <StyledOverlay {...props} ref={ref} />;
});

Portal.displayName = "Portal";

export { Portal };
