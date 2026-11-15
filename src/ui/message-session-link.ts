const SESSION_LINK_PREFIXES = ["bycoda://session/v1/", "https://link.bycoda.codes/session/v1/"];

/**
 * A Bycoda session reference in message Markdown. It opens in the app, never in a browser;
 * the session-reference route owns strict parsing, owner checks and the unavailable state.
 */
export function messageSessionLink(raw: string): string | null {
  const href = raw.trim().replace(/^<([\s\S]+)>$/, "$1");
  if (href.length > 4096 || /[\s\u0000-\u001f\u007f]/.test(href)) return null;
  return SESSION_LINK_PREFIXES.some((prefix) => href.startsWith(prefix)) ? href : null;
}

/** Same route OS deep links reach through `rewriteSessionReferencePath`. */
export function messageSessionRoute(href: string) {
  return { pathname: "/session-reference" as const, params: { link: href } };
}
