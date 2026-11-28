import type { Block } from "@/domain/types";

/**
 * Saved "by the way" side conversations (`Block.btwThreads` on a user turn), read-only on the phone.
 * Desktop's BtwSheet asks and stores them; the phone lists what the Host sends with the transcript.
 * Rich activity (`BtwMessage.blocks`) and live `pendingBlocks` are not shown; the text is.
 */
export type BtwHistoryStatus = "running" | "ready" | "error";

export type BtwHistoryMessage = { id: string; role: "user" | "assistant"; text: string };

export type BtwHistoryEntry = {
  id: string;
  /** The first question, compacted to one short line; empty when the thread holds no question text. */
  title: string;
  status: BtwHistoryStatus;
  createdAt: number;
  /** The turn the thread was asked about, compacted to one short line. */
  turnText: string;
  messages: BtwHistoryMessage[];
};

const TITLE_LIMIT = 60;

export function compactBtwLine(text: string, limit = TITLE_LIMIT): string {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > limit ? `${compact.slice(0, limit - 1).trimEnd()}…` : compact;
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

function readMessage(value: unknown, index: number): BtwHistoryMessage | undefined {
  const message = record(value);
  if (!message || (message.role !== "user" && message.role !== "assistant")) return undefined;
  if (typeof message.text !== "string" || !message.text.trim()) return undefined;
  return { id: typeof message.id === "string" ? message.id : String(index), role: message.role, text: message.text };
}

/** Every saved side thread in the loaded transcript, oldest first (desktop `sessionBtwThreads` order). */
export function btwHistory(blocks: readonly Block[]): BtwHistoryEntry[] {
  const entries: BtwHistoryEntry[] = [];
  for (const block of blocks) {
    if (block.role !== "user" || !Array.isArray(block.btwThreads)) continue;
    for (const raw of block.btwThreads as unknown[]) {
      const thread = record(raw);
      if (!thread || typeof thread.id !== "string" || !Array.isArray(thread.messages)) continue;
      const messages = thread.messages.flatMap((message, index) => readMessage(message, index) ?? []);
      if (!messages.length) continue;
      const status: BtwHistoryStatus =
        thread.status === "running" || thread.status === "error" ? thread.status : "ready";
      entries.push({
        id: thread.id,
        title: compactBtwLine(messages.find((message) => message.role === "user")?.text ?? ""),
        status,
        createdAt: typeof thread.createdAt === "number" && Number.isFinite(thread.createdAt) ? thread.createdAt : 0,
        turnText: compactBtwLine(typeof block.text === "string" ? block.text : ""),
        messages,
      });
    }
  }
  return entries.sort((a, b) => a.createdAt - b.createdAt);
}
