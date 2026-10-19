import type { DevServer, DevServerTarget } from "./types";

/** Discovery is host-wide; mobile project tools must never infer scope from a name. */
export function projectServers(servers: readonly DevServer[], projectId: string): DevServer[] {
  return servers.filter((server) => server.projectId === projectId && server.association !== "uncertain");
}

/** Carry the process birth identity so a recycled PID cannot become an action target. */
export function serverTarget(server: DevServer, projectId: string, tree: boolean): DevServerTarget & { projectId: string } {
  if (server.projectId !== projectId || server.association === "uncertain")
    throw new Error("This server belongs to another project.");
  if (server.process && (!Number.isInteger(server.process.pid) || server.process.pid <= 0 || !server.process.startedAt))
    throw new Error("Refresh the server details before continuing.");
  if (!server.process && !server.managed)
    throw new Error("Refresh the server details before continuing.");
  return {
    projectId,
    id: server.id,
    tree,
    ...(server.process ? { identity: { pid: server.process.pid, startedAt: server.process.startedAt } } : {}),
  };
}

export function expectedPort(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const port = Number(value);
  if (!/^\d+$/.test(value.trim()) || !Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("Enter a port between 1 and 65535.");
  return port;
}
