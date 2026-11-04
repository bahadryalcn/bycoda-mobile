/** Browser behavior for the existing overlay registry; no DOM is read at module load. */
export type WebOverlayLayer = {
  id: string;
  element: HTMLElement;
  label?: string;
  visible: boolean;
  onClose(): void;
  role?: "menu";
  opener?: HTMLElement;
  canInteract?(): boolean;
};

export type WebMenuLayer = {
  id: string;
  element: HTMLElement;
  anchor: HTMLElement;
  label: string;
  onClose(): void;
  check(): boolean;
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

  const focus = (element: HTMLElement | null | undefined, preventScroll = true) => {
    if (element?.isConnected) element.focus({ preventScroll });
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

  const menuItems = (element: HTMLElement) => focusable(element).filter(
    (item) => item.getAttribute("role") === "menuitem",
  );
  const onKeyDown = (event: KeyboardEvent) => {
    if (!state.unlocked || !active || event.defaultPrevented || event.isComposing) return;
    if (active.canInteract && !active.canInteract()) { refresh(); return; }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      // The sheet's requestClose enforces pending/dirty/canClose rules.
      if (active.visible) active.onClose();
      return;
    }
    if (active.role === "menu" && !event.altKey && !event.ctrlKey && !event.metaKey) {
      const items = menuItems(active.element);
      const index = items.indexOf(asWebElement(ownerDocument.activeElement)!);
      let target: HTMLElement | undefined;
      if (event.key === "ArrowDown") target = items[(index + 1) % items.length];
      else if (event.key === "ArrowUp") target = items[(index < 0 ? items.length - 1 : index + items.length - 1) % items.length];
      else if (event.key === "Home") target = items[0];
      else if (event.key === "End") target = items.at(-1);
      else if (event.key === "Tab") target = index < 0
        ? event.shiftKey ? items.at(-1) : items[0]
        : items[(index + (event.shiftKey ? items.length - 1 : 1)) % items.length];
      if (["ArrowDown", "ArrowUp", "Home", "End", "Tab"].includes(event.key)) {
        event.preventDefault();
        focus(target ?? active.element, false);
        return;
      }
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
    if (active.canInteract && !active.canInteract()) { refresh(); return; }
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

  const apply = (next: WebOverlayState) => {
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
      layer.element.setAttribute("role", layer.role ?? "dialog");
      layer.element.setAttribute("data-bycoda-overlay", layer.id);
      layer.element.tabIndex = -1;
      if (layer.label) layer.element.setAttribute("aria-label", layer.label);
      else layer.element.removeAttribute("aria-label");
      if (layer.id === nextActive?.id && layer.role !== "menu") layer.element.setAttribute("aria-modal", "true");
      else layer.element.removeAttribute("aria-modal");
    }

    // Expose the destination and move focus BEFORE hiding its previous owner.
    // This also avoids aria-hidden being rejected for a focused background.
    if (nextActive) {
      expose(nextActive.element);
      if (previous?.id !== nextActive.id) {
        if (!openers.has(nextActive.id)) {
          const ancestors = previous ? (openers.get(previous.id) ?? []) : [];
          const opener = nextActive.opener ?? currentFocus;
          const scope =
            opener && previous?.element.contains(opener)
              ? previous.element
              : opener && next.background?.contains(opener)
                ? next.background
                : null;
          openers.set(
            nextActive.id,
            opener && scope
              ? [captureTarget(opener, scope), ...ancestors]
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
              : nextActive.role === "menu" ? menuItems(nextActive.element)[0] ?? nextActive.element : nextActive.element,
          nextActive.role !== "menu",
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
  };
  let base: WebOverlayState = state;
  let disposed = false;
  const menus = new Map<string, WebMenuLayer & { owner: string | null }>();
  const refresh = () => {
    if (disposed) return;
    const top = base.layers.at(-1);
    const retired: WebMenuLayer[] = [];
    for (const [id, menu] of menus) {
      if (!base.unlocked || !menu.check() || !menu.anchor.isConnected || !menu.element.isConnected ||
        menu.owner !== (top?.id ?? null) || top?.visible === false) {
        // Conceal before React unmounts a retired/private portal. Never restore
        // its focus into a hidden or unauthorized source.
        menu.element.setAttribute("inert", "");
        menu.element.setAttribute("aria-hidden", "true");
        if (!menu.check()) {
          openers.delete(id);
          lastFocused.delete(id);
          for (const [owner, element] of lastFocused)
            if (element.contains(menu.anchor) || menu.anchor.contains(element)) lastFocused.delete(owner);
        }
        menus.delete(id);
        retired.push(menu);
      }
    }
    const menu = [...menus.values()].at(-1);
    apply({ ...base, layers: menu ? [...base.layers, {
      id: menu.id, element: menu.element, visible: true, onClose: menu.onClose, label: menu.label,
      role: "menu", canInteract: menu.check, opener: menu.anchor.closest<HTMLElement>('button, [role="button"]') ?? menu.anchor,
    }] : base.layers });
    for (const entry of retired) entry.onClose();
  };
  return {
    sync(next: WebOverlayState) { base = next; refresh(); },
    registerMenu(menu: WebMenuLayer) {
      if (disposed) return () => {};
      for (const [id, previous] of menus) {
        if (id === menu.id) continue;
        previous.element.setAttribute("inert", "");
        previous.element.setAttribute("aria-hidden", "true");
        menus.delete(id);
        previous.onClose();
      }
      const entry = { ...menu, owner: menu.anchor.closest("[data-bycoda-overlay]")?.getAttribute("data-bycoda-overlay") ?? null };
      menus.set(menu.id, entry);
      refresh();
      return () => { if (menus.get(menu.id) === entry && menus.delete(menu.id)) refresh(); };
    },
    dispose() {
      disposed = true;
      menus.clear();
      ownerDocument.removeEventListener("keydown", onKeyDown);
      ownerDocument.removeEventListener("focusin", onFocusIn);
      for (const element of [...isolated]) expose(element);
      openers.clear();
      lastFocused.clear();
      active = undefined;
    },
  };
}
