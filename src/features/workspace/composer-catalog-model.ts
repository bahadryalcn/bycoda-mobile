import type { RemoteInboxItem, RemoteInboxProvider } from "../../../../src/features/inbox/model/remoteInbox";

const aliases = {
  jira: ["jira", "jr", "j"],
  github: ["github", "gh"],
  gitlab: ["gitlab", "gl"],
  linear: ["linear", "lin", "ln"],
  azuredevops: ["ado", "azure", "az"],
} satisfies Record<RemoteInboxProvider, string[]>;

export const trackerNames: Record<RemoteInboxProvider, string> = {
  jira: "Jira", github: "GitHub", gitlab: "GitLab", linear: "Linear", azuredevops: "Azure DevOps",
};

export type MentionSource = "files" | "crews" | "notes" | "servers" | RemoteInboxProvider;
const sources: Record<MentionSource, readonly string[]> = {
  files: ["file", "files"],
  jira: aliases.jira,
  github: aliases.github,
  crews: ["crews", "crew"],
  notes: ["notes", "note"],
  gitlab: aliases.gitlab,
  linear: aliases.linear,
  azuredevops: aliases.azuredevops,
  servers: ["srv", "server"],
};

export function mentionSources(query: string) {
  const colon = query.indexOf(":");
  const alias = (colon === -1 ? query : query.slice(0, colon)).toLowerCase();
  const hints = (Object.keys(sources) as MentionSource[]).flatMap((source) =>
    sources[source].some((candidate) => candidate.startsWith(alias))
      ? [{ source, aliases: sources[source], prefix: sources[source][0]! }]
      : [],
  );
  const exact = hints.find((hint) => hint.aliases.includes(alias));
  const source = exact?.source;
  return {
    hints: colon === -1 ? hints : [],
    source,
    alias,
    needle: source ? query.slice(colon === -1 ? query.length : colon + 1) : query,
  };
}

export function isTracker(source?: MentionSource): source is RemoteInboxProvider {
  return source !== undefined && Object.hasOwn(aliases, source);
}

/** Same reference spelling as the desktop picker. GitLab uses ! for merge requests. */
export function workItemLabel(item: RemoteInboxItem) {
  if (item.provider === "jira" || item.provider === "linear")
    return `${item.provider}:${item.identifier || item.number}`;
  const alias = item.provider === "github" ? "gh" : item.provider === "gitlab" ? "gl" : "ado";
  return `${alias}:${item.repo}${item.provider === "gitlab" && item.kind === "pr" ? "!" : "#"}${item.number}`;
}

export type ComposerGroup = "sources" | "files" | "crews" | "agents" | "notes" | "servers" |
  "issues" | "pulls" | "commands" | "skills" | "groups" | "templates";

export type ComposerSuggestion = {
  id: string;
  name: string;
  label: string;
  detail: string;
  kind: "file" | "folder" | "skill" | "command" | "source" | "crew" | "agent" | "note" | "server" | "issue" | "pr" | "template";
  group?: ComposerGroup;
  path?: string;
  keywords?: string;
  unavailable?: string;
  /** `new-session`, `resume` and `move-to-folder` open their mobile destination instead of inserting text. */
  action?: "scope" | "side-question" | "new-session" | "resume" | "move-to-folder";
  template?: string;
};

export function rankComposerSuggestions(items: ComposerSuggestion[], query: string, scopedFiles: boolean) {
  const needle = query.toLowerCase();
  const ranked = items.flatMap((item) => {
    if (item.kind === "source" || (scopedFiles && item.kind !== "file" && item.kind !== "folder"))
      return item.kind === "source" ? [{ item, rank: -1 }] : [];
    const name = item.name.toLowerCase();
    const label = item.label.toLowerCase();
    const words = `${name} ${label} ${item.detail.toLowerCase()} ${item.keywords ?? ""}`;
    const rank = !needle || name === needle || label === needle ? 0
      : name.startsWith(needle) || label.startsWith(needle) ? 1
      : words.includes(needle) ? 2 : -1;
    return rank < 0 ? [] : [{ item, rank }];
  });
  const groups = new Map<ComposerGroup | undefined, ComposerSuggestion[]>();
  for (const { item } of ranked.sort((a, b) => a.rank - b.rank)) {
    const group = groups.get(item.group);
    if (!group) groups.set(item.group, [item]);
    else if (group.length < (item.group === "commands" ? 50 : 12)) group.push(item);
  }
  return [...groups.values()].flatMap((group) => group[0]?.group === "commands"
    ? [...group.filter((item) => !item.unavailable), ...group.filter((item) => item.unavailable)]
    : group);
}
