import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { visibleMediaData } from "@/ui/media-policy";
import { hostKey, useHostClient, useHostQuery, useHostReadActive } from "@/state/queries";
import { useCopy } from "@/ui/copy";
import { useDebouncedSearch } from "@/ui/search-field";
import { useInboxRead } from "@/features/inbox/provider-queries";
import { validateCrewDirectory } from "@/features/management/crews/model";
import { useTemplates } from "@/features/management/templates/template-store";
import { mergeCliCommands } from "../../../../src/features/skills/model/cliCommandCatalog";
import { crewMentionTargets } from "../../../../src/features/sessions/model/crewMentions";
import type { RemoteInboxAvailability } from "../../../../src/features/inbox/model/remoteInbox";
import type { DiscoveredSkill, ClaudeCommandEntry } from "../../../../src/platform/tauri/fs";
import type { MobileNoteList } from "@/remote/contracts/notes";
import type { HostSession } from "@/remote/types";
import { mentionLabel, type ComposerToken } from "./composer-tokens";
import { isTracker, mentionSources, rankComposerSuggestions, trackerNames, workItemLabel, type ComposerSuggestion } from "./composer-catalog-model";
import { composerBuiltins } from "./composer-command-catalog";
import { crewReferenceLabel } from "./composer-crew-delivery";

export type { ComposerSuggestion } from "./composer-catalog-model";

export function useComposerCatalog(session: HostSession | undefined, token: ComposerToken | null) {
  const copy = useCopy();
  const client = useHostClient();
  const active = useHostReadActive();
  const projectId = session?.projectId;
  const cwd = session?.session.worktreeCwd || session?.session.cwd;
  const harness = session?.session.harness;
  const sessionId = session?.session.id;
  const capabilities = client?.machine.capabilities;
  const enabled = !!client && active && !!session && !!cwd && !!token;
  const mentions = token?.trigger === "@";
  const { hints, source, needle, alias } = mentionSources(mentions ? token.query : "");
  const scope = hostKey(client?.machine.id ?? null, [
    "composer-catalog", client?.machine.environmentId, client?.machine.endpoint, projectId, sessionId, cwd, harness,
  ]);
  const desktopOnly = copy("Masaüstünde kullanılabilir", "Available on desktop");
  const files = useQuery({
    queryKey: [...scope, "files"],
    queryFn: ({ signal }) => client!.request<string[]>("files.index", { projectId, cwd }, { signal }),
    enabled: enabled && mentions && (!source || source === "files"),
    staleTime: 60_000,
    retry: false,
  });
  const indexed = visibleMediaData(files);
  const fileRows = useMemo((): ComposerSuggestion[] => {
    const all = new Map<string, boolean>();
    for (const path of indexed?.slice(0, 50_000) ?? []) {
      const relative = path.replaceAll("\\", "/");
      if (!relative || relative.startsWith("/") || /^[a-z]:/i.test(relative) || relative.split("/").includes("..")) continue;
      all.set(relative, false);
      const parts = relative.split("/");
      for (let i = 1; i < parts.length; i++) all.set(parts.slice(0, i).join("/") + "/", true);
    }
    return Array.from(all, ([path, directory]) => ({
      id: path, path, name: path, label: mentionLabel(path),
      detail: "", kind: directory ? "folder" : "file", group: "files",
    }));
  }, [indexed]);
  const fileMatches = useMemo(() => rankComposerSuggestions(fileRows, needle, source === "files"), [fileRows, needle, source]);

  const tracker = isTracker(source) ? source : undefined;
  const trackerSupported = !!capabilities?.includes("inbox.providers.desktop");
  const search = useDebouncedSearch(needle, 225);
  const providerSearch = tracker ? /[#!](\d+)$/.exec(search)?.[1] ?? search : search;
  const availability = useHostQuery<RemoteInboxAvailability>(
    ["provider-inbox", "availability"], "inbox.provider.status", {},
    { enabled: enabled && mentions && trackerSupported && (!source || !!tracker) },
  );
  const connected = enabled && trackerSupported && visibleMediaData(availability)?.available === true;
  const showTracker = mentions && (!source || !!tracker);
  const trackerItems = useInboxRead({
    action: "list",
    input: { projectId, query: { assignedToMe: false, state: search ? "all" : "open", search: providerSearch,
      ...(tracker ? { providers: [tracker] } : {}) } },
  }, connected && showTracker && search === needle);
  const crews = useQuery({
    queryKey: [...scope, "crews"],
    queryFn: async ({ signal }) => validateCrewDirectory(
      await client!.request("crews.list", { projectId, historyLimit: 1 }, { signal }), projectId,
    ),
    enabled: enabled && mentions && (!source || source === "crews") && !!capabilities?.includes("crews.v1"),
    staleTime: 30_000,
    retry: false,
  });
  const notes = useQuery({
    queryKey: [...scope, "notes"],
    queryFn: ({ signal }) => client!.request<MobileNoteList>("notes.list", { projectId }, { signal }),
    enabled: enabled && mentions && source === "notes" && !!capabilities?.includes("sessions.noteContext.v1"),
    staleTime: 30_000,
    retry: false,
  });
  const skills = useQuery({
    queryKey: [...scope, "skills"],
    queryFn: ({ signal }) => client!.request<DiscoveredSkill[]>("workspace.run", { command: "list_skills", args: { cwd } }, { signal }),
    enabled: enabled && (token?.trigger === "/" && harness === "claude" || token?.trigger === "$" && harness === "codex"),
    staleTime: 60_000,
    retry: false,
  });
  const commands = useQuery({
    queryKey: [...scope, "commands"],
    queryFn: ({ signal }) => client!.request<ClaudeCommandEntry[]>("workspace.run", { command: "list_claude_commands", args: { cwd } }, { signal }),
    enabled: enabled && token?.trigger === "/" && harness === "claude",
    staleTime: 60_000,
    retry: false,
  });
  const templates = useTemplates((state) => state.hydrated && !state.error ? state.rows : undefined);
  if (!token) return { data: [], isFetching: false, error: null, refetch: async () => {} };

  const rows: ComposerSuggestion[] = [];
  const queries: Array<{ isFetching: boolean; error: unknown; refetch: () => Promise<unknown> }> = [];
  if (mentions) {
    for (const hint of hints) {
      const name = isTracker(hint.source) ? trackerNames[hint.source]
        : hint.source === "files" ? copy("Proje dosyaları", "Project files")
        : hint.source === "crews" ? copy("Ekipler ve ajanlar", "Crews and agents")
        : hint.source === "notes" ? copy("Notlar", "Notes")
        : copy("Sunucular", "Servers");
      rows.push({ id: `source:${hint.source}`, name, label: `${hint.prefix}:`,
        kind: "source", group: "sources", action: "scope",
        detail: hint.aliases.map((value) => `@${value}`).join(" · "),
        unavailable: hint.source === "servers" || (isTracker(hint.source) && !trackerSupported) ? desktopOnly : undefined });
    }
    if (!source || source === "files") {
      queries.push(files);
      if (enabled) rows.push(...fileMatches);
    }
    if (showTracker && trackerSupported) {
      queries.push(availability);
      if (connected && search === needle) {
        queries.push(trackerItems);
        const result = visibleMediaData(trackerItems);
        for (const item of result?.items ?? []) {
          const label = workItemLabel(item);
          rows.push({ id: `item:${item.provider}:${item.kind}:${label}`, name: item.title, label,
            detail: `@${label}`, kind: item.kind === "pr" ? "pr" : "issue", group: item.kind === "pr" ? "pulls" : "issues",
            // The connected provider already ranked the search result.
            keywords: needle.toLowerCase() });
        }
        if (tracker && result?.errors[tracker])
          rows.push({ id: "tracker-error", name: trackerNames[tracker], label: "", detail: "", kind: "source", group: "sources",
            unavailable: result.errors[tracker] });
      } else if (tracker && availability.data?.available === false) {
        rows.push({ id: "tracker-offline", name: trackerNames[tracker], label: "", detail: "", kind: "source", group: "sources",
          unavailable: copy("Bilgisayardaki bycoda’yı aç", "Open Bycoda on your computer") });
      }
    }
    if (tracker && !trackerSupported && !hints.length)
      rows.push({ id: "tracker-unavailable", name: trackerNames[tracker], label: "", detail: "", kind: "source", group: "sources", unavailable: desktopOnly });
    if (!source || source === "crews") {
      if (capabilities?.includes("crews.v1")) queries.push(crews);
      const directory = enabled ? visibleMediaData(crews) : undefined;
      const targets = directory && client && projectId
        ? crewMentionTargets({ ...directory, machineId: client.machine.id, projectId, memberAsk: !!capabilities?.includes("crews.member.ask.v1") })
        : [];
      for (const target of targets) {
        rows.push({
          id: `${target.kind}:${target.id}`, name: target.name, label: crewReferenceLabel(target.token),
          detail: `@${crewReferenceLabel(target.token)}`, kind: target.kind === "crew" ? "crew" : "agent",
          group: target.kind === "crew" ? "crews" : "agents",
        });
      }
      if (source === "crews" && !capabilities?.includes("crews.v1"))
        rows.push({ id: "crews-unavailable", name: copy("Ekipler ve ajanlar", "Crews and agents"), label: "", detail: "", kind: "source", group: "sources", unavailable: desktopOnly });
    }
    if (source === "notes") {
      if (capabilities?.includes("sessions.noteContext.v1")) queries.push(notes);
      for (const note of enabled ? visibleMediaData(notes)?.notes ?? [] : []) {
        if (note.slugPending) continue;
        rows.push({ id: `note:${note.id}`, name: note.title, label: `notes:${note.slug}`, detail: `@notes:${note.slug}`,
          kind: "note", group: "notes" });
      }
      if (!capabilities?.includes("sessions.noteContext.v1"))
        rows.push({ id: "notes-unavailable", name: copy("Notlar", "Notes"), label: "", detail: "", kind: "source", group: "sources", unavailable: desktopOnly });
    }
    if (source === "servers" && !hints.length)
      rows.push({ id: "servers-unavailable", name: copy("Sunucular", "Servers"), label: "", detail: `@${alias}:`, kind: "source", group: "sources", unavailable: desktopOnly });
  } else if (harness && (token.trigger === "/" || harness === "codex")) {
    const builtin = token.trigger === "/" ? composerBuiltins(copy, harness, capabilities, { project: !!projectId }) : [];
    rows.push(...builtin);
    const taken = new Set(builtin.map((item) => item.name));
    if (harness === "claude" || token.trigger === "$") queries.push(skills);
    for (const skill of enabled ? visibleMediaData(skills) ?? [] : []) {
      if (taken.has(skill.name) || skill.userInvocable === false || !/^[\p{L}\p{N}_.:-]+$/u.test(skill.name)) continue;
      if (skill.installProvider && skill.installProvider !== "all" && skill.installProvider !== harness) continue;
      taken.add(skill.name);
      rows.push({ id: `skill:${skill.name}`, name: skill.name, label: skill.name, detail: skill.description, kind: "skill",
        group: token.trigger === "$" ? "skills" : "commands" });
    }
    if (token.trigger === "/") {
      if (harness === "claude") queries.push(commands);
      const native = mergeCliCommands({ harness, reported: [], disk: enabled ? visibleMediaData(commands) ?? [] : [], taken });
      rows.push(...native.map((command): ComposerSuggestion => ({ id: `command:${command.name}`, name: command.name,
        label: command.invocation, detail: command.description, kind: "command", group: "commands",
        keywords: command.aliases?.join(" ").toLowerCase() })));
      rows.push({ id: "skill-groups", name: copy("Kayıtlı beceri grupları", "Saved skill groups"),
        label: "", detail: "", kind: "template", group: "groups", unavailable: desktopOnly });
      rows.push(...(templates ?? []).map((template): ComposerSuggestion => ({
        id: `template:${template.id}`, name: template.name, label: template.name, detail: template.trigger ? `;${template.trigger}` : "",
        kind: "template", group: "templates", template: template.body,
      })));
    }
  }
  return {
    data: rankComposerSuggestions(rows, mentions ? needle : token.query, source === "files"),
    isFetching: queries.some((query) => query.isFetching) || (connected && showTracker && search !== needle),
    error: queries.find((query) => query.error)?.error,
    refetch: () => Promise.all(queries.filter((query) => query.error).map((query) => query.refetch())),
  };
}
