/** Browser behavior for the existing overlay registry; no DOM is read at module load. */
export type WebOverlayLayer = {
  id: string;
  element: HTMLElement;
  label?: string;
  visible: boolean;
  onClose(): void;
};

type WebOverlayState = {
  background: HTMLElement | null;
  layers: readonly WebOverlayLayer[];
  unlocked: boolean;
};

type FocusIdentity = { tag: string; role: string; label: string };
type FocusTarget = {
  element: HTMLElement;
  scope: HTMLElement;
  ancestors: readonly HTMLElement[];
  identity: FocusIdentity;
};

/** A remounted opener is safe to restore only when its identity is unambiguous. */
export function uniqueFocusIdentityMatch<T>(
  saved: FocusIdentity,
  candidates: readonly { identity: FocusIdentity; value: T }[],
): T | null {
  if (!saved.label) return null;
  const matches = candidates.filter(
    ({ identity }) =>
      identity.tag === saved.tag && identity.role === saved.role && identity.label === saved.label,
  );
  return matches.length === 1 ? matches[0]!.value : null;
}

const focusableSelector = [
  "a[href]",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
  "iframe",
  "[tabindex]",
  '[contenteditable="true"]',
  "audio[controls]",
  "video[controls]",
].join(",");

export function asWebElement(value: unknown): HTMLElement | null {
  return typeof HTMLElement !== "undefined" && value instanceof HTMLElement ? value : null;
}

/** One document listener belongs to the provider, rather than to individual sheets. */
export function createOverlayWebFocus(ownerDocument: Document) {
  let state: WebOverlayState = { background: null, layers: [], unlocked: false };
  let active: WebOverlayLayer | undefined;
  const openers = new Map<string, readonly FocusTarget[]>();
  const lastFocused = new Map<string, HTMLElement>();
  const isolated = new Set<HTMLElement>();

  const focus = (element: HTMLElement | null | undefined) => {
    if (element?.isConnected) element.focus({ preventScroll: true });
  };
  const expose = (element: HTMLElement) => {
    element.removeAttribute("inert");
    element.removeAttribute("aria-hidden");
    isolated.delete(element);
  };
  const hide = (element: HTMLElement) => {
    element.setAttribute("aria-hidden", "true");
    element.setAttribute("inert", "");
    isolated.add(element);
  };
  const canFocus = (element: HTMLElement) => {
    const style = ownerDocument.defaultView?.getComputedStyle(element);
    return (
      element.tabIndex >= 0 &&
      !element.matches(":disabled") &&
      element.getAttribute("aria-disabled") !== "true" &&
      !element.closest('[inert], [hidden], [aria-hidden="true"]') &&
      !!element.getClientRects().length &&
      style?.visibility !== "hidden" &&
      style?.display !== "none"
    );
  };
  const focusable = (element: HTMLElement) =>
    [...element.querySelectorAll<HTMLElement>(focusableSelector)].filter(canFocus);
  const identity = (element: HTMLElement): FocusIdentity => ({
    tag: element.tagName,
    role: element.getAttribute("role") ?? (element.tagName === "BUTTON" ? "button" : ""),
    label: element.getAttribute("aria-label")?.trim() ?? "",
  });
  const captureTarget = (element: HTMLElement, scope: HTMLElement): FocusTarget => {
    const ancestors: HTMLElement[] = [];
    let parent = element.parentElement;
    while (parent && parent !== scope) {
      ancestors.push(parent);
      parent = parent.parentElement;
    }
    return { element, scope, ancestors, identity: identity(element) };
  };
  const resolveTarget = (
    targets: readonly FocusTarget[] | undefined,
    destination: HTMLElement | null,
  ) => {
    if (!destination) return null;
    for (const target of targets ?? []) {
      if (target.element.isConnected) {
        if (destination.contains(target.element) && canFocus(target.element)) return target.element;
        continue;
      }
      if (target.scope !== destination) continue;
      // Keep fallback inside the original row/section. A changed route with no
      // surviving owner must not redirect focus to an unrelated matching label.
      const owner =
        target.ancestors.find((element) => element.isConnected && destination.contains(element)) ??
        (target.ancestors.length ? null : destination);
      if (!owner) continue;
      const match = uniqueFocusIdentityMatch(
        target.identity,
        focusable(owner).map((element) => ({ identity: identity(element), value: element })),
      );
      if (match) return match;
    }
    return null;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (!state.unlocked || !active || event.defaultPrevented || event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      // The sheet's requestClose enforces pending/dirty/canClose rules.
      if (active.visible) active.onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const candidates = focusable(active.element);
    const current = asWebElement(ownerDocument.activeElement);
    const index = current ? candidates.indexOf(current) : -1;
    if (!candidates.length) {
      event.preventDefault();
      focus(active.element);
    } else if (index < 0 || (event.shiftKey ? index === 0 : index === candidates.length - 1)) {
      event.preventDefault();
      focus(event.shiftKey ? candidates.at(-1) : candidates[0]);
    }
  };
  const onFocusIn = (event: FocusEvent) => {
    if (!state.unlocked || !active) return;
    const element = asWebElement(event.target);
    if (element && active.element.contains(element)) {
      lastFocused.set(active.id, element);
      return;
    }
    const previous = lastFocused.get(active.id);
    focus(previous && active.element.contains(previous) ? previous : active.element);
  };

  ownerDocument.addEventListener("keydown", onKeyDown);
  ownerDocument.addEventListener("focusin", onFocusIn);

  return {
    sync(next: WebOverlayState) {
      const previous = active;
      const nextActive = next.unlocked ? next.layers.at(-1) : undefined;
      const currentFocus = asWebElement(ownerDocument.activeElement);
      state = next;
      active = nextActive;
      if (!next.unlocked) {
        // Lock/unmount must never move focus back into private content.
        for (const element of [...isolated]) expose(element);
        openers.clear();
        lastFocused.clear();
        return;
      }
      for (const layer of next.layers) {
        layer.element.setAttribute("role", "dialog");
        layer.element.setAttribute("data-bycoda-overlay", layer.id);
        layer.element.tabIndex = -1;
        if (layer.label) layer.element.setAttribute("aria-label", layer.label);
        else layer.element.removeAttribute("aria-label");
        if (layer.id === nextActive?.id) layer.element.setAttribute("aria-modal", "true");
        else layer.element.removeAttribute("aria-modal");
      }

      // Expose the destination and move focus BEFORE hiding its previous owner.
      // This also avoids aria-hidden being rejected for a focused background.
      if (nextActive) {
        expose(nextActive.element);
        if (previous?.id !== nextActive.id) {
          if (!openers.has(nextActive.id)) {
            const ancestors = previous ? (openers.get(previous.id) ?? []) : [];
            const scope =
              currentFocus && previous?.element.contains(currentFocus)
                ? previous.element
                : currentFocus && next.background?.contains(currentFocus)
                  ? next.background
                  : null;
            openers.set(
              nextActive.id,
              currentFocus && scope
                ? [captureTarget(currentFocus, scope), ...ancestors]
                : ancestors,
            );
          }
          const previousClosed = previous && !next.layers.some((layer) => layer.id === previous.id);
          const opener = previousClosed
            ? resolveTarget(openers.get(previous.id), nextActive.element)
            : undefined;
          const remembered = lastFocused.get(nextActive.id);
          focus(
            opener?.isConnected && nextActive.element.contains(opener)
              ? opener
              : remembered?.isConnected && nextActive.element.contains(remembered)
                ? remembered
                : nextActive.element,
          );
        } else if (!currentFocus || !nextActive.element.contains(currentFocus)) {
          focus(nextActive.element);
        }
        if (next.background) hide(next.background);
        for (const layer of next.layers) if (layer.id !== nextActive.id) hide(layer.element);
      } else {
        for (const element of [...isolated]) expose(element);
        if (previous) focus(resolveTarget(openers.get(previous.id), next.background));
      }
      const ids = new Set(next.layers.map((layer) => layer.id));
      for (const id of openers.keys()) if (!ids.has(id)) openers.delete(id);
      for (const id of lastFocused.keys()) if (!ids.has(id)) lastFocused.delete(id);
      for (const element of [...isolated]) if (!element.isConnected) isolated.delete(element);
    },
    dispose() {
      ownerDocument.removeEventListener("keydown", onKeyDown);
      ownerDocument.removeEventListener("focusin", onFocusIn);
      for (const element of [...isolated]) expose(element);
      openers.clear();
      lastFocused.clear();
      active = undefined;
    },
  };
}
