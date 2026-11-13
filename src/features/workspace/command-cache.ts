import type { QueryClient } from "@tanstack/react-query";
import { hostKey } from "@/state/host-request";
import { isProjectPrivacyQuery } from "./project-privacy-cache";

/** Session commands refresh their data without expiring the independent visibility proof. */
export function invalidateCommandQueries(
  cache: QueryClient,
  machineId: string | null,
  scope: readonly unknown[],
  command?: Record<string, unknown>,
) {
  if (
    typeof command?.sessionId === "string" &&
    (command.type === "configure" || scope[0] === "session")
  ) {
    const sessionId = command.sessionId;
    const projectId = scope[0] === "session" ? scope[2] : command.projectId;
    return cache.invalidateQueries({
      queryKey: hostKey(machineId, []),
      predicate: ({ queryKey: key }) =>
        (key[2] === "session" && key[3] === sessionId) ||
        (key[2] === "sessions" && (!projectId || key[3] == null || key[3] === projectId)) ||
        (key[2] === "project-summaries" &&
          (!projectId || !Array.isArray(key[3]) || key[3].includes(projectId))) ||
        (command.type !== "configure" && key[2] === "session-queue" && key[3] === sessionId),
    });
  }
  return cache.invalidateQueries({
    queryKey: hostKey(machineId, scope),
    predicate: ({ queryKey }) => !isProjectPrivacyQuery(queryKey),
  });
}
