import { serverTarget } from "./tool-model";
import type { DevServerDetails, DevServerTarget } from "./types";

export type ServerReview = {
  machineId: string;
  projectId: string;
  action: "stop" | "restart" | "kill";
  target: DevServerTarget & { projectId: string };
  ports: number[];
  processes: { pid: number; startedAt: string; name: string }[];
};

export function reviewServer(details: DevServerDetails, machineId: string, projectId: string,
  action: ServerReview["action"], tree: boolean): ServerReview {
  if (!machineId || !/^[a-f0-9]{64}$/.test(details.expectedImpact ?? ""))
    throw new Error("Refresh server details on an updated host before continuing.");
  if (action === "restart" && !tree) throw new Error("Review the full process tree before restarting.");
  const target = { ...serverTarget(details.server, projectId, tree), expectedImpact: details.expectedImpact };
  const processes = [...(details.server.process ? [details.server.process] : []), ...(tree ? details.descendants : [])]
    .map(({ pid, startedAt, name }) => ({ pid, startedAt, name }));
  if (processes.some(({ pid, startedAt }) => !Number.isInteger(pid) || pid <= 0 || !startedAt))
    throw new Error("Refresh the server details before continuing.");
  if (details.affectedPorts.some((port) => !Number.isInteger(port) || port < 1 || port > 65535))
    throw new Error("Invalid affected ports.");
  return { machineId, projectId, action, target, ports: [...details.affectedPorts], processes };
}

export function serverReviewMatches(review: ServerReview, machineId: string | null, projectId: string, id: string) {
  return review.machineId === machineId && review.projectId === projectId && review.target.id === id;
}

/** Never put credentials in a preview address or open a host URL on the phone. */
export function privatePreviewUrl(value: string): string {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password)
    throw new Error("Select an HTTP or HTTPS endpoint without credentials.");
  if (url.hostname === "0.0.0.0") url.hostname = "127.0.0.1";
  if (url.hostname === "[::]") url.hostname = "[::1]";
  return url.toString();
}
