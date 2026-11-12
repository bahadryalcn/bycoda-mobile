import { describe, expect, it, vi } from "vitest";

// The hook module pulls native modules; only the pure interval helper is under test.
vi.mock("expo-crypto", () => ({ randomUUID: () => "test-id" }));
vi.mock("@/state/queries", () => ({ hostKey: () => "", useHostClient: () => null, useHostQuery: () => ({}) }));
vi.mock("@tanstack/react-query", () => ({ useMutation: () => ({}), useQueryClient: () => ({}) }));
import { queuePollInterval } from "./use-session-queue";

const row = { id: "next", text: "Next", attachments: [] };

describe("queue polling interval", () => {
  it("polls quickly while rows are queued", () => {
    expect(queuePollInterval({ messages: [row] }, 0, 1_000_000)).toBe(2500);
  });

  it("keeps the fast poll for 15 s after an enqueue, then slows down", () => {
    const empty = { messages: [] };
    expect(queuePollInterval(empty, 1_000, 10_000)).toBe(2500);
    expect(queuePollInterval(empty, 1_000, 16_000)).toBe(15_000);
  });

  it("polls slowly when idle and never enqueued", () => {
    expect(queuePollInterval(undefined, 0, 1_700_000_000_000)).toBe(15_000);
    expect(queuePollInterval({ messages: [] }, 0, 1_700_000_000_000)).toBe(15_000);
  });
});
