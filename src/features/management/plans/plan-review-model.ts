import type { Block } from "@/domain/types";

export function readyPlan(block: Block): boolean {
  return block.role === "plan" && !block.orchestration && !block.streaming &&
    !!block.text.trim() && (!block.plan || block.plan.status === "ready");
}

export type PlanOutlineStep = { id: string; title: string; description?: string };

const MAX_OUTLINE_STEPS = 40;
const topLevel = /^(?:\d+[.)]|[-*+])\s+(.+)$/;
const nested = /^\s+(?:\d+[.)]|[-*+])\s+(.+)$/;
const plain = (value: string) => value.replace(/[*_`]/g, "").replace(/\s+/g, " ").trim();

/**
 * Reads the plan's own list items (numbered or bulleted) as an ordered outline, with up to
 * two nested items folded into each step's description. Plans without lists yield no steps.
 */
export function planOutline(text: string): PlanOutlineStep[] {
  const steps: { title: string; notes: string[] }[] = [];
  let inFence = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*```/.test(line)) { inFence = !inFence; continue; }
    if (inFence) continue;
    const top = topLevel.exec(line);
    if (top) { steps.push({ title: plain(top[1]), notes: [] }); continue; }
    const sub = nested.exec(line);
    const current = steps.at(-1);
    if (sub && current && current.notes.length < 2) current.notes.push(plain(sub[1]));
  }
  return steps.filter((step) => step.title).slice(0, MAX_OUTLINE_STEPS).map((step, index) => ({
    id: String(index), title: step.title, description: step.notes.join(" · ") || undefined,
  }));
}

export function reviewedPlanCommand(sessionId: string, opening: Block, current: Block, text: string) {
  if (!readyPlan(current) || current.id !== opening.id || current.text !== opening.text)
    throw new Error("The reviewed plan changed. Review the current plan before building.");
  if (!text.trim() || text.length > 256_000 || text.includes("\0")) throw new Error("Invalid plan text");
  return { type: "send" as const, sessionId, intent: "build" as const,
    planBlockId: opening.id, expectedPlanText: opening.text, text };
}
