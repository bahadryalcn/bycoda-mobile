import type { TunnelTarget } from "../../../modules/bycoda-host-socket/src/types";
import type { DevServer } from "../tools/types";
import { isLoopbackWebUrl } from "@/ui/loopback-link";

export const TUNNEL_CAPABILITY = "dev.servers.tunnel.v1";

export type TunnelOpening = "tunnel" | "host";

/** Loopback links open on this phone only when the Host offers the tunnel and the native build can scope it. */
export function chooseTunnelOpening(input: {
  capabilities: readonly string[] | undefined;
  supported: boolean;
}): TunnelOpening {
  return input.supported && !!input.capabilities?.includes(TUNNEL_CAPABILITY) ? "tunnel" : "host";
}

export type TunnelRefusal = "invalid" | "https" | "none" | "ambiguous" | "identity";

export type ResolvedTunnel = {
  target: TunnelTarget;
  /** Path, query and hash of the opened link; the page loads under the tunnel alias. */
  path: string;
};

const WILDCARD_ADDRESSES = ["0.0.0.0", "::", "::1"];
const isLoopbackAddress = (address: string) =>
  WILDCARD_ADDRESSES.includes(address) || address.startsWith("127.");

/**
 * Resolves a loopback link to exactly one verified dev server process of this project, like the
 * desktop `accessibleDevelopmentUrl`. Anything unprovable returns a refusal and the caller falls
 * back to the Host Browser.
 */
export function resolveTunnelTarget(input: {
  href: string;
  projectId: string;
  servers: readonly DevServer[];
}): { ok: true; value: ResolvedTunnel } | { ok: false; reason: TunnelRefusal } {
  let url: URL;
  try {
    url = new URL(input.href);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (url.username || url.password || !isLoopbackWebUrl(input.href))
    return { ok: false, reason: "invalid" };
  if (url.protocol !== "http:") return { ok: false, reason: "https" };
  const port = Number(url.port || 80);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return { ok: false, reason: "invalid" };
  const matches = input.servers
    .filter((server) => server.projectId === input.projectId && server.association !== "uncertain")
    .flatMap((server) =>
      server.endpoints
        .filter((endpoint) => endpoint.port === port && isLoopbackAddress(endpoint.address))
        .map((endpoint) => ({ server, endpoint })),
    );
  if (!matches.length) return { ok: false, reason: "none" };
  // Duplicate IPv4/IPv6 listeners of one process are equivalent; different processes are not.
  if (new Set(matches.map((match) => match.server.id)).size > 1)
    return { ok: false, reason: "ambiguous" };
  const { server } = matches[0]!;
  const proc = server.process;
  if (!proc || !Number.isInteger(proc.pid) || proc.pid <= 0 || !proc.startedAt)
    return { ok: false, reason: "identity" };
  const matching = matches.map((match) => match.endpoint);
  if (matching.some((endpoint) => endpoint.url.toLowerCase().startsWith("https:")))
    return { ok: false, reason: "https" };
  const endpoint = matching.find((value) => value.address.startsWith("127.")) ?? matching[0]!;
  return {
    ok: true,
    value: {
      target: {
        projectId: input.projectId,
        id: server.id,
        pid: proc.pid,
        startedAt: proc.startedAt,
        port,
        address: endpoint.address,
      },
      path: `${url.pathname}${url.search}${url.hash}`,
    },
  };
}

/** The URL the native view loads: the project's path under the tunnel alias. */
export function tunnelPageUrl(alias: string, port: number, path: string): string {
  return `http://${alias}:${port}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Address-bar form: the alias is a secret-ish transport detail, the user sees `localhost`. */
export function tunnelDisplayUrl(url: string, alias: string, port: number): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname.toLowerCase() !== alias.toLowerCase()) return url;
    parsed.hostname = "localhost";
    return parsed.port === String(port) || parsed.port === "" ? parsed.href : url;
  } catch {
    return url;
  }
}
