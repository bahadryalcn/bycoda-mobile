/** A rectangle in window coordinates, as `measureInWindow` reports it. */
export type WindowFrame = { x: number; y: number; width: number; height: number };

export type AnchoredMenuPlacement = {
  /** Offsets inside the overlay layer. Exactly one of `bottom` (opens upward) or `top` is set. */
  left: number;
  width: number;
  bottom?: number;
  top?: number;
  maxHeight: number;
  /** Which corner the panel grows from, for an origin-aware entrance. */
  origin: "bottom right" | "top right" | "bottom left" | "top left";
};

/**
 * Places a small menu next to its trigger inside a full-window overlay layer. It opens upward
 * (the composer sits above the keyboard, so the room is above it) with its trailing edge on the
 * trigger's trailing edge, is clamped to the screen edges and safe area, and only opens downward
 * when the space above cannot hold `minHeight` and the space below is larger. The area under the
 * keyboard is never used.
 */
export function anchoredMenuPlacement(input: {
  anchor: WindowFrame;
  overlay: WindowFrame;
  desiredWidth: number;
  insets: { top: number; bottom: number; left: number; right: number };
  keyboardInset?: number;
  margin?: number;
  gap?: number;
  minHeight?: number;
}): AnchoredMenuPlacement {
  const { overlay, insets } = input;
  const margin = input.margin ?? 12, gap = input.gap ?? 6, minHeight = input.minHeight ?? 96;
  const local = { x: input.anchor.x - overlay.x, y: input.anchor.y - overlay.y, width: input.anchor.width, height: input.anchor.height };
  const minLeft = insets.left + margin;
  const maxRight = overlay.width - insets.right - margin;
  const width = Math.max(0, Math.min(input.desiredWidth, maxRight - minLeft));
  const trailing = local.x + local.width;
  const alignEnd = trailing - width >= minLeft;
  const left = Math.round(Math.min(Math.max(alignEnd ? trailing - width : local.x, minLeft), maxRight - width));
  const floor = overlay.height - Math.max(insets.bottom, input.keyboardInset ?? 0) - margin;
  const above = Math.max(0, local.y - gap - (insets.top + margin));
  const below = Math.max(0, floor - (local.y + local.height + gap));
  const side = alignEnd ? "right" : "left";
  if (above >= minHeight || above >= below)
    return { left, width, bottom: Math.round(overlay.height - local.y + gap), maxHeight: Math.floor(above), origin: `bottom ${side}` };
  return { left, width, top: Math.round(local.y + local.height + gap), maxHeight: Math.floor(below), origin: `top ${side}` };
}

/**
 * Whether a re-measured trigger moved far enough that the open menu would point at the wrong place.
 * Android reports keyboard height changes (emoji panel, suggestion strip) as another "keyboard
 * shown"; the menu follows the trigger then instead of closing. Sub-pixel jitter is ignored.
 */
export function anchoredMenuAnchorMoved(previous: WindowFrame | undefined, next: WindowFrame, tolerance = 2): boolean {
  if (!previous) return true;
  return (
    Math.abs(previous.x - next.x) > tolerance ||
    Math.abs(previous.y - next.y) > tolerance ||
    Math.abs(previous.width - next.width) > tolerance ||
    Math.abs(previous.height - next.height) > tolerance
  );
}

/**
 * Whether a chosen row may run. The access is read where the trigger renders: the menu itself lives
 * in the app's PortalHost, outside the screen's private-content boundary, where the context would
 * always report public access. A row whose private content was withdrawn while open runs nothing.
 */
export function anchoredMenuChoiceAllowed(
  item: { disabled?: boolean },
  access: { allowed: boolean; check: () => boolean },
): boolean {
  if (item.disabled) return false;
  return access.allowed && access.check();
}
