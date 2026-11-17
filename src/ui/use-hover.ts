import { useState } from "react";

/**
 * Pointer hover (iPad trackpad/mouse, Android mouse). Touch never hovers, so phones are unchanged.
 * Spread `handlers` on a Pressable and tint the surface while `hovered`; this adds no focus ring.
 */
export function useHover(disabled = false) {
  const [hovered, setHovered] = useState(false);
  return {
    hovered: hovered && !disabled,
    handlers: { onHoverIn: () => setHovered(true), onHoverOut: () => setHovered(false) },
  };
}
