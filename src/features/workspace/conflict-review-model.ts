import type { HostConflictStages } from "../../../../host/git/git-conflicts";
export type ConflictChoice = "ours" | "theirs" | "both";
export type ConflictPart = { kind: "text"; text: string } | { kind: "conflict"; id: string; ours: string; theirs: string; base: string | null };
const kinds = new Set(["both-modified", "both-added", "deleted-by-us", "deleted-by-them", "added-by-us", "added-by-them", "both-deleted"]);
export function readConflictStages(value: unknown, relative: string): HostConflictStages {
  const stages = value as HostConflictStages;
  if (!stages || stages.relative !== relative || !kinds.has(stages.kind) || typeof stages.binary !== "boolean" || typeof stages.tooLarge !== "boolean" || typeof stages.workingExists !== "boolean" || ![stages.base, stages.ours, stages.theirs].every((text) => text === null || typeof text === "string" && text.length <= 1024 * 1024)) throw new Error("Invalid conflict review response");
  return stages;
}
/** Recognize complete standard Git marker blocks. Ambiguous/nested marker input
 * is rejected rather than silently dropping content. No editable code is used. */
export function conflictParts(text: string): ConflictPart[] {
  if (text.includes("\0") || text.length > 1024 * 1024) throw new Error("Conflict exceeds the mobile review budget");
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  if (lines.length > 4000) throw new Error("Conflict exceeds the mobile review budget");
  const result: ConflictPart[] = []; let plain = ""; let index = 0; let count = 0;
  const content = (line: string) => line.replace(/\r?\n$/, "");
  const marker = (line: string) => /^(?:<<<<<<<|\|\|\|\|\|\|\||=======|>>>>>>>)(?: |$)/.test(content(line));
  while (index < lines.length) {
    if (!/^<<<<<<<(?: |$)/.test(content(lines[index]))) { if (marker(lines[index])) throw new Error("Incomplete conflict markers"); plain += lines[index++]; continue; }
    if (plain) { result.push({ kind: "text", text: plain }); plain = ""; }
    index++; let ours = ""; let theirs = ""; let base: string | null = null;
    while (index < lines.length && !marker(lines[index])) ours += lines[index++];
    if (index < lines.length && /^\|{7}(?: |$)/.test(content(lines[index]))) { base = ""; index++; while (index < lines.length && !marker(lines[index])) base += lines[index++]; }
    if (index >= lines.length || content(lines[index]) !== "=======") throw new Error("Incomplete or nested conflict markers");
    index++; while (index < lines.length && !marker(lines[index])) theirs += lines[index++];
    if (index >= lines.length || !/^>>>>>>>(?: |$)/.test(content(lines[index]))) throw new Error("Incomplete or nested conflict markers");
    index++; result.push({ kind: "conflict", id: String(count++), ours, theirs, base });
    if (count > 200) throw new Error("Conflict exceeds the mobile review budget");
  }
  if (plain) result.push({ kind: "text", text: plain });
  return result;
}
export function resolveConflictParts(parts: readonly ConflictPart[], choices: Readonly<Record<string, ConflictChoice>>): string {
  return parts.map((part) => {
    if (part.kind === "text") return part.text;
    const choice = choices[part.id];
    if (!["ours", "theirs", "both"].includes(choice)) throw new Error("Choose a version for each conflict block");
    return choice === "both" ? part.ours + part.theirs : part[choice];
  }).join("");
}
