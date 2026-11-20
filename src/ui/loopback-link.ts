import { createContext, useContext } from "react";

/**
 * Loopback web addresses name a service on the computer, not on the phone. They open only in a
 * session-level browser that holds the original machine/project/session proof.
 */
export function isLoopbackWebUrl(href: string): boolean {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;
  // Runtimes differ on keeping IPv6 brackets in `hostname`; compare without them.
  const host = url.hostname
    .toLowerCase()
    .replace(/\.$/, "")
    .replace(/^\[|\]$/g, "");
  return (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "::1" ||
    host === "::" ||
    host === "0.0.0.0" ||
    /^(?:::ffff:)?127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^::ffff:7f[0-9a-f]{2}:[0-9a-f]{1,4}$/.test(host)
  );
}

/** Identity of the session a loopback link belongs to; a transcript from another session never matches. */
export function loopbackScopeKey(scope: { machineId: string; projectId: string; sessionId?: string }): string {
  return JSON.stringify([scope.machineId, scope.projectId, scope.sessionId ?? null]);
}

export type LoopbackLinkOwner = {
  /** `loopbackScopeKey` of the session whose browser opens the link. */
  scope: string;
  open: (href: string) => void;
};

const LoopbackLinkContext = createContext<LoopbackLinkOwner | null>(null);

/** Provided by the session screen; absent outside a session, so loopback links have no owner. */
export const LoopbackLinkProvider = LoopbackLinkContext.Provider;

export function useLoopbackLink(): LoopbackLinkOwner | null {
  return useContext(LoopbackLinkContext);
}
