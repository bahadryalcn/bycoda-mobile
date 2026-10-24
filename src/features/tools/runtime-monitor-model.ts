export type RuntimeMonitor = { id: string; projectId: string; url: string; sourceId?: string };
export function monitorUrl(value: string): string {
  if (!value.trim() || value.length > 2048) throw new Error("Enter a port or HTTP(S) URL.");
  const input = value.trim();
  if (/^\d+$/.test(input) && (+input < 1 || +input > 65535)) throw new Error("Port must be between 1 and 65535.");
  const url = new URL(/^\d+$/.test(input) ? `http://localhost:${input}` : input);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Enter an HTTP(S) URL without credentials.");
  return url.href;
}
export function readMonitors(value: unknown, projectId: string): RuntimeMonitor[] {
  if (!Array.isArray(value) || value.length > 8) throw new Error("Invalid monitor list.");
  const ids = new Set<string>();
  return value.map((entry: unknown) => {
    if (!entry || typeof entry !== "object") throw new Error("Invalid monitor.");
    const row = entry as Record<string, unknown>;
    if (typeof row.id !== "string" || !row.id || row.id.length > 200 || ids.has(row.id) || row.projectId !== projectId ||
      typeof row.url !== "string" || (row.sourceId !== undefined && (typeof row.sourceId !== "string" || row.sourceId.length > 200)))
      throw new Error("Monitor does not belong to this project.");
    ids.add(row.id);
    return { id: row.id, projectId, url: monitorUrl(row.url), ...(typeof row.sourceId === "string" ? { sourceId: row.sourceId } : {}) };
  });
}
export function uncertainMonitorWrite(error: unknown) {
  return !!error && typeof error === "object" && "uncertain" in error && error.uncertain === true;
}
