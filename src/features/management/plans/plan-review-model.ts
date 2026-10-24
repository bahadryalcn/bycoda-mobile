import type { Block } from "@/domain/types";

export function readyPlan(block: Block): boolean {
  return block.role === "plan" && !block.orchestration && !block.streaming &&
    !!block.text.trim() && (!block.plan || block.plan.status === "ready");
}

export function reviewedPlanCommand(sessionId: string, opening: Block, current: Block, text: string) {
  if (!readyPlan(current) || current.id !== opening.id || current.text !== opening.text)
    throw new Error("The reviewed plan changed. Review the current plan before building.");
  if (!text.trim() || text.length > 256_000 || text.includes("\0")) throw new Error("Invalid plan text");
  return { type: "send" as const, sessionId, intent: "build" as const,
    planBlockId: opening.id, expectedPlanText: opening.text, text };
}
