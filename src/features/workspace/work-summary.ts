import type { Block } from "./wire";
import { activityState, activityTitle } from "./transcript-model";

type Copy = (tr: string, en: string, values?: Record<string, string | number>) => string;
type WorkKind = "research" | "edit" | "run" | "agent" | "other";

// Port of desktop `workSummaryLine` (src/features/sessions/model/transcriptActivity.ts). The
// desktop module pulls platform path code, so the classification is repeated here, localized.
function key(kind: string | undefined) {
  return kind?.trim().toLowerCase() ?? "";
}

export function toolKind(block: Block): WorkKind {
  const kind = key(block.tool?.kind);
  const preview = block.tool?.preview?.kind;
  const title = (block.text || block.tool?.title || "").trim();
  const generic = !kind || kind === "other";
  if (["agent", "task", "subagent"].includes(kind) || (generic && /^(agent|task|subagent)\b/i.test(title)))
    return "agent";
  if (preview === "write" || ["edit", "write", "delete", "move"].includes(kind) || (generic && /^(edit|write|delete|update)\b/i.test(title)))
    return "edit";
  if (preview === "search" || kind === "search" || (generic && /^(find|search|grep|glob)\b/i.test(title)))
    return "research";
  if (preview === "read" || kind === "read" || (generic && /^(read|list)\b/i.test(title)))
    return "research";
  if (["execute", "shell", "bash", "powershell"].includes(kind) || (generic && /^(bash|shell|powershell|pwsh|run(?:ning)?(?:\s+command)?)\b/i.test(title)))
    return "run";
  return "other";
}

function isSearch(block: Block) {
  const kind = key(block.tool?.kind);
  const title = (block.text || block.tool?.title || "").trim();
  return block.tool?.preview?.kind === "search" || kind === "search" || /^(find|search|grep|glob)\b/i.test(title);
}

function target(block: Block) {
  const preview = block.tool?.preview;
  const labelled = (block.text || block.tool?.title || "").match(/^(?:Read|List|Edit|Write)\s+(.+)$/i)?.[1];
  return preview?.path ?? preview?.fileName ?? labelled?.trim() ?? block.id;
}

function leaf(path: string) {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path;
}

function running(block: Block) {
  const status = block.tool?.status?.toLowerCase() ?? "";
  if (["completed", "success", "done", "stopped", "interrupted", "failed", "error", "denied", "rejected"].includes(status))
    return false;
  return !!block.streaming || ["in_progress", "pending", "running"].includes(status);
}

const isTool = (block: Block) => block.role === "tool" || block.role === "approval";

/**
 * What a run of work adds up to, one clause per kind in the order the agent did them:
 * "Read 3 files · Edited 2 files · Ran a command". The clause for the call in flight
 * stays present tense while `live`.
 */
export function workSummaryLine(steps: readonly Block[], copy: Copy, live = false): string {
  const order: WorkKind[] = [];
  const reads = new Set<string>();
  const edits = new Set<string>();
  let searches = 0;
  let runs = 0;
  let background = 0;
  let backgroundLive = 0;
  let agents = 0;
  let others = 0;
  let notes = 0;
  for (const block of steps) {
    if (block.interjection) {
      notes++;
      continue;
    }
    if (!isTool(block)) continue;
    const kind = toolKind(block);
    if (!order.includes(kind)) order.push(kind);
    if (kind === "edit") edits.add(target(block));
    else if (kind === "agent") agents++;
    else if (kind === "run") {
      if (block.tool?.background) {
        background++;
        if (running(block)) backgroundLive++;
      } else runs++;
    } else if (kind === "research") {
      if (isSearch(block)) searches++;
      else reads.add(target(block));
    } else others++;
  }
  const current = live ? [...steps].reverse().find(isTool) : undefined;
  const currentKind = current ? toolKind(current) : undefined;
  const files = (paths: Set<string>) => {
    const [first] = paths;
    return paths.size === 1 && first ? leaf(first) : undefined;
  };
  const clause = (kind: WorkKind): string => {
    const now = kind === currentKind;
    switch (kind) {
      case "edit": {
        const one = files(edits);
        if (one) return now ? copy("{p0} düzenleniyor", "Editing {p0}", { p0: one }) : copy("{p0} düzenlendi", "Edited {p0}", { p0: one });
        return now
          ? copy("{p0} dosya düzenleniyor", "Editing {p0} files", { p0: edits.size })
          : copy("{p0} dosya düzenlendi", "Edited {p0} files", { p0: edits.size });
      }
      case "research": {
        if (reads.size > 0 && searches === 0) {
          const one = files(reads);
          if (one) return now ? copy("{p0} okunuyor", "Reading {p0}", { p0: one }) : copy("{p0} okundu", "Read {p0}", { p0: one });
          return now
            ? copy("{p0} dosya okunuyor", "Reading {p0} files", { p0: reads.size })
            : copy("{p0} dosya okundu", "Read {p0} files", { p0: reads.size });
        }
        if (reads.size === 0)
          return now ? copy("Projede aranıyor", "Searching the project") : copy("Projede arandı", "Searched the project");
        return now ? copy("Proje inceleniyor", "Exploring the project") : copy("Proje incelendi", "Explored the project");
      }
      case "run":
        if (backgroundLive > 0) return copy("Arka planda çalışıyor", "Running in background");
        if (runs === 0 && background > 0) return copy("Arka planda bitti", "Finished in background");
        if (runs === 1) return now ? copy("Bir komut çalıştırılıyor", "Running a command") : copy("Bir komut çalıştırıldı", "Ran a command");
        return now
          ? copy("{p0} komut çalıştırılıyor", "Running {p0} commands", { p0: runs })
          : copy("{p0} komut çalıştırıldı", "Ran {p0} commands", { p0: runs });
      case "agent":
        if (agents === 1) return now ? copy("Bir alt ajan çalışıyor", "Running a subagent") : copy("Bir alt ajan çalıştı", "Ran a subagent");
        return now
          ? copy("{p0} alt ajan çalışıyor", "Running {p0} subagents", { p0: agents })
          : copy("{p0} alt ajan çalıştı", "Ran {p0} subagents", { p0: agents });
      default:
        if (others === 1) return now ? copy("Bir araç çalışıyor", "Running a tool") : copy("Bir araç çalıştı", "Ran a tool");
        return now
          ? copy("{p0} araç çalışıyor", "Running {p0} tools", { p0: others })
          : copy("{p0} araç çalıştı", "Ran {p0} tools", { p0: others });
    }
  };
  const noteClause = notes === 1 ? copy("1 not", "1 note") : notes > 1 ? copy("{p0} not", "{p0} notes", { p0: notes }) : "";
  if (!order.length) {
    if (noteClause) return noteClause;
    if (steps.length > 0 && steps.every((block) => block.role === "system")) return copy("Durum güncellemesi", "Status update");
    return live ? copy("Düşünüyor", "Thinking") : copy("Düşündü", "Thought");
  }
  return [...order.map(clause), ...(noteClause ? [noteClause] : [])].join(" · ");
}


/** One line inside an expanded work group: a verb, then a file chip, a command or prose. */
export type WorkStep = {
  id: string;
  label: string;
  file?: string;
  code?: string;
  text?: string;
  state: "running" | "failed" | "done";
};

function firstLine(text: string | undefined) {
  return text?.trim().split(/\r?\n/, 1)[0]?.trim() || undefined;
}

/**
 * The record behind `workSummaryLine`, one line per step in the order the agent did them:
 * "Read [a.ts]", "Ran `pnpm test`". Reasoning and notes keep their first line of prose.
 */
export function workSteps(steps: readonly Block[], copy: Copy, live = false): WorkStep[] {
  return steps.flatMap((block): WorkStep[] => {
    const status = activityState(block);
    const now = live && status === "running";
    const state = status === "failed" ? "failed" : now ? "running" : "done";
    if (block.interjection)
      return [{ id: block.id, label: copy("Not", "Note"), text: firstLine(block.text), state }];
    if (block.role === "reasoning")
      return [
        {
          id: block.id,
          label: now ? copy("Düşünüyor", "Thinking") : copy("Düşündü", "Thought"),
          text: firstLine(block.text),
          state,
        },
      ];
    if (!isTool(block)) {
      const text = firstLine(block.text);
      return text ? [{ id: block.id, label: text, state }] : [];
    }
    const title = activityTitle(block);
    const kind = toolKind(block);
    const path = target(block);
    const file = path === block.id ? undefined : leaf(path);
    switch (kind) {
      case "edit":
        return [
          {
            id: block.id,
            label: now ? copy("Düzenleniyor", "Editing") : copy("Düzenlendi", "Edited"),
            file,
            text: file ? undefined : title,
            state,
          },
        ];
      case "research":
        if (isSearch(block))
          return [
            {
              id: block.id,
              label: now ? copy("Aranıyor", "Searching") : copy("Arandı", "Searched"),
              code: block.tool?.preview?.query || title.replace(/^(find|search|grep|glob)\s+/i, ""),
              state,
            },
          ];
        return [
          {
            id: block.id,
            label: now ? copy("Açılıyor", "Opening") : copy("Açıldı", "Opened"),
            file,
            text: file ? undefined : title,
            state,
          },
        ];
      case "run":
        return [
          {
            id: block.id,
            label: now ? copy("Çalışıyor", "Running") : copy("Çalıştırıldı", "Ran"),
            code: firstLine((block.shell?.command || block.tool?.detail || title).replace(/^(bash|shell|powershell|pwsh)\s*[:>]?\s*/i, "")),
            state,
          },
        ];
      case "agent":
        return [
          {
            id: block.id,
            label: now ? copy("Alt ajan çalışıyor", "Subagent running") : copy("Alt ajan", "Subagent"),
            text: title,
            state,
          },
        ];
      default:
        return [{ id: block.id, label: title || copy("Araç", "Tool"), state }];
    }
  });
}

/** Which kind of busy the step in flight is, as PanelUI ThinkingOrb names it. */
export function workOrbState(steps: readonly Block[]): "working" | "searching" | "shaping" | "solving" {
  const current = [...steps].reverse().find((block) => activityState(block) === "running");
  if (!current || current.role === "reasoning") return current ? "solving" : "working";
  if (!isTool(current)) return "working";
  const kind = toolKind(current);
  return kind === "research" ? "searching" : kind === "edit" ? "shaping" : "working";
}
