import { visibleMediaData } from "@/ui/media-policy";
import { hostKey } from "@/state/host-request";
import { useQuery } from "@tanstack/react-query";
import { useHostClient } from "@/state/queries";
import { mergeCliCommands } from "../../../../src/features/skills/model/cliCommands";
import type { HostSession } from "@/remote/types";
import type { DiscoveredSkill, ClaudeCommandEntry } from "../../../../src/platform/tauri/fs";
import { mentionLabel, type ComposerToken } from "./composer-tokens";

export type ComposerSuggestion = { id: string; name: string; label: string; detail: string; kind: "file" | "folder" | "skill" | "command"; path?: string; action?: "compact" | "plan" };
export function useComposerCatalog(session: HostSession | undefined, token: ComposerToken | null) {
  const client = useHostClient(); const cwd = session?.session.worktreeCwd || session?.session.cwd; const harness = session?.session.harness;
  const query = useQuery({ queryKey: hostKey(client?.machine.id ?? null, ["composer-catalog", client?.machine.environmentId, client?.machine.endpoint, session?.projectId, session?.session.id, cwd, harness, token?.trigger]), queryFn: async ({ signal }): Promise<ComposerSuggestion[]> => {
    if (!client || !session || !cwd) return [];
    if (token?.trigger === "@") {
      const paths = await client.request<string[]>("files.index", { projectId: session.projectId, cwd }, { signal });
      const all = new Map<string, boolean>();
      for (const path of paths.slice(0, 50_000)) { const relative = path.replace(/\\/g, "/"); if (relative.startsWith("/") || relative.split("/").includes("..")) continue; all.set(relative, false); const parts = relative.split("/"); for (let i = 1; i < parts.length; i++) all.set(parts.slice(0, i).join("/") + "/", true); }
      return Array.from(all, ([path, directory]) => ({ id: path, path, name: path, label: mentionLabel(path), detail: directory ? "" : path.split("/").slice(0, -1).join("/"), kind: directory ? "folder" : "file" }));
    }
    if (token?.trigger === "$" && harness !== "codex") return [];
    const discovered = await client.request<DiscoveredSkill[]>("workspace.run", { command: "list_skills", args: { cwd } }, { signal });
    const skills: ComposerSuggestion[] = discovered.filter((skill) => /^[\p{L}\p{N}_.:-]+$/u.test(skill.name)).map((skill) => ({ id: `skill:${skill.name}`, name: skill.name, label: skill.name, detail: skill.description, kind: "skill" }));
    if (token?.trigger === "$") return skills;
    const disk = harness === "claude" ? await client.request<ClaudeCommandEntry[]>("workspace.run", { command: "list_claude_commands", args: { cwd } }, { signal }) : [];
    const native = mergeCliCommands({ harness: session.session.harness, reported: [], disk, taken: new Set(["compact", "plan", ...(harness === "claude" ? skills.map((skill) => skill.name) : [])]) });
    return [
      { id: "app:compact", name: "compact", label: "compact", detail: "", kind: "command", action: "compact" },
      { id: "app:plan", name: "plan", label: "plan", detail: "", kind: "command", action: "plan" },
      ...(harness === "claude" ? skills : []),
      ...native.map((command) => ({ id: `command:${command.name}`, name: command.name, label: command.invocation, detail: command.description, kind: "command" as const })),
    ];
  }, enabled: !!client && !!session && !!token, staleTime: 60_000, retry: false, networkMode: "always" });
  return { ...query, data: visibleMediaData(query) };
}
