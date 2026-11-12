/** Route path for breadcrumbs: no query, and ids replaced by `:id`. */
export function templateRoute(pathname: string): string {
  const segments = pathname.split(/[?#]/)[0]!.split("/").filter(Boolean);
  const templated = segments.map((segment, index) => {
    const parent = segments[index - 1];
    return /\d/.test(segment) || parent === "session" || parent === "project" ? ":id" : segment;
  });
  return `/${templated.join("/")}`;
}

/** How the app reaches a Host route: a paired local-network route, Tailscale, or another remote route. */
export function transportKind(route: { endpoint: string; lanKey?: string } | null | undefined): string {
  if (!route) return "unknown";
  if (route.lanKey) return "lan";
  let host = "";
  try {
    host = new URL(route.endpoint).hostname;
  } catch {
    return "unknown";
  }
  const [a, b] = host.split(".").map(Number);
  return host.endsWith(".ts.net") || (a === 100 && b! >= 64 && b! <= 127) ? "tailscale" : "remote";
}
