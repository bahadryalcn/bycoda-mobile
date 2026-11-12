/** Launcher / home-screen quick actions: the allowlist for what an action may open. */
export interface QuickActionItem {
  id: string;
  title: string;
  params: { href: string };
}

const allowedHref = /^\/(?:sessions|session\/[^/?#]+|project\/[^/?#]+)(?:\?[^#]*)?$/;

export function quickActionItems(copy: (tr: string, en: string) => string): QuickActionItem[] {
  return [
    // `new=1` makes the sessions screen open its new-session sheet.
    { id: "new-session", title: copy("Yeni oturum", "New session"), params: { href: "/sessions?new=1" } },
    { id: "sessions", title: copy("Oturumlar", "Sessions"), params: { href: "/sessions" } },
  ];
}

/** Only known in-app routes are navigable; anything else is ignored. */
export function quickActionHref(
  action: { params?: Record<string, unknown> | null } | undefined,
): string | null {
  const href = action?.params?.href;
  return typeof href === "string" && allowedHref.test(href) ? href : null;
}
