import { pushOnce } from "@/ui/navigation";
import { NEW_CHAT_ROUTE_ID } from "./new-chat-model";

/**
 * Opens the empty new session. `/session/new` is a static route beside `/session/[id]`; it is
 * addressed through the typed dynamic pathname so the generated route types need no new entry.
 * A project screen passes its project (and worktree folder) and computer so they start selected.
 * A prompt link passes its words (placed only in an empty draft) and the project key it names.
 */
export function openNewChat(target: { projectId?: string; machineId?: string; cwd?: string; prompt?: string; project?: string } = {}) {
  pushOnce({
    pathname: "/session/[id]",
    params: {
      id: NEW_CHAT_ROUTE_ID,
      ...(target.projectId ? { projectId: target.projectId } : {}),
      ...(target.machineId ? { machineId: target.machineId } : {}),
      ...(target.cwd ? { cwd: target.cwd } : {}),
      ...(target.prompt ? { prompt: target.prompt } : {}),
      ...(target.project ? { project: target.project } : {}),
    },
  });
}
