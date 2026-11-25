import { isTailnetAddress } from "../../../src/integrations/mobile-lan";
import type { MobileRoute } from "../remote/types";

export type RouteKind = "lan" | "tailscale" | "public";

type RouteLike = Pick<MobileRoute, "endpoint" | "lanKey" | "public">;

/**
 * What a route reaches: a public tunnel (owner opted in on the computer), the tailnet
 * (100.64.0.0/10 or *.ts.net), or the local network. An unkeyed HTTPS address that is none of
 * these (a manually entered proxy) has no kind.
 */
export function routeKind(route: RouteLike): RouteKind | null {
  if (route.public) return "public";
  let host: string;
  try {
    host = new URL(route.endpoint).hostname.toLowerCase();
  } catch {
    return null;
  }
  if (isTailnetAddress(host) || host.endsWith(".ts.net")) return "tailscale";
  if (route.lanKey !== undefined || route.endpoint.startsWith("http:")) return "lan";
  return null;
}

/** Preference rank: local network, then Tailscale, other addresses, public internet last. */
export function routeRank(route: RouteLike): number {
  const kind = routeKind(route);
  return kind === "lan" ? 0 : kind === "tailscale" ? 1 : kind === "public" ? 3 : 2;
}

export function routeLabel(kind: RouteKind, copy: (tr: string, en: string) => string): string {
  return kind === "lan"
    ? copy("Yerel ağ", "Local network")
    : kind === "tailscale"
      ? copy("Tailscale (özel)", "Tailscale (private)")
      : copy("Genel internet", "Public internet");
}
