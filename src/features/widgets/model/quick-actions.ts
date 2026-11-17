import type { WidgetSessionInput } from "./snapshot";

/** Launcher / home-screen quick actions: the allowlist for what an action may open. */
export interface QuickActionItem {
  id: string;
  title: string;
  params: { href: string };
}

/** iOS shows at most four dynamic actions; Android launchers accept at least that many. */
export const QUICK_ACTION_LIMIT = 4;
export const RECENT_QUICK_ACTION_SESSIONS = 2;
const TITLE_LIMIT = 40;

const allowedHref = /^\/(?:sessions|session\/[^/?#]+|project\/[^/?#]+)(?:\?[^#]*)?$/;

/** A session a quick action may open; the identity is carried so the route is unambiguous. */
export interface QuickActionSession {
  id: string;
  projectId: string;
  machineId: string;
  title: string;
}

/**
 * Newest open sessions of the active computer. Titles can be sensitive and the launcher sits
 * outside the app lock, so they are offered only when the owner already allows widget titles.
 */
export function recentQuickActionSessions(
  feed: { machineId: string | null; ready: boolean; sessions: readonly WidgetSessionInput[] },
  showTitles: boolean,
  limit = RECENT_QUICK_ACTION_SESSIONS,
): QuickActionSession[] {
  const machineId = feed.machineId;
  if (!showTitles || !feed.ready || !machineId) return [];
  return feed.sessions
    .filter((session) => !session.archived && !session.child && !session.draft && session.title.trim())
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, limit)
    .map((session) => ({
      id: session.id,
      projectId: session.projectId,
      machineId,
      title: [...session.title.trim().replace(/\s+/g, " ")].slice(0, TITLE_LIMIT).join(""),
    }));
}

export function quickActionItems(
  copy: (tr: string, en: string) => string,
  recents: readonly QuickActionSession[] = [],
): QuickActionItem[] {
  const items: QuickActionItem[] = [
    // `new=1` makes the sessions screen open its new-session sheet.
    {
      id: "new-session",
      title: copy("Yeni oturum", "New session"),
      params: { href: "/sessions?new=1" },
    },
    ...recents.map((session) => ({
      id: `session:${session.id}`,
      title: session.title,
      params: {
        href: `/session/${encodeURIComponent(session.id)}?projectId=${encodeURIComponent(session.projectId)}&machineId=${encodeURIComponent(session.machineId)}`,
      },
    })),
    { id: "sessions", title: copy("Oturumlar", "Sessions"), params: { href: "/sessions" } },
  ];
  return items.slice(0, QUICK_ACTION_LIMIT);
}

/** Only known in-app routes are navigable; anything else is ignored. */
export function quickActionHref(
  action: { params?: Record<string, unknown> | null } | undefined,
): string | null {
  const href = action?.params?.href;
  return typeof href === "string" && allowedHref.test(href) ? href : null;
}
